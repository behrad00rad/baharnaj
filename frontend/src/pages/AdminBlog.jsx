import { PanelDisclosure } from "../components/PanelGuide";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BlogContent } from "../components/BlogContent";
import { SEO } from "../components/SEO";
import { JalaliDatePicker } from "../components/DatePicker";
import { api } from "../shared/api";
import "./AdminBlog.css";

const unwrap = (data) => data?.results || data || [];
const statusLabels = { draft: "پیش‌نویس", published: "منتشر شده", scheduled: "زمان‌بندی شده", archived: "آرشیو شده" };
const blankBlock = (type) => {
  if (type === "heading") return { type, level: 2, text: "" };
  if (type === "list") return { type, style: "bullet", items: [""] };
  if (type === "separator") return { type };
  if (type === "callout") return { type, tone: "note", title: "", text: "" };
  if (type === "service") return { type, service_id: "" };
  if (type === "cta") return { type, title: "این سرویس را در بهارناژ رزرو کنید", text: "", service_ids: [] };
  return { type, text: "" };
};
const faDate = (value) => value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(value)) : "—";
const firstError = (error, fallback) => {
  const data = error.response?.data;
  if (typeof data?.detail === "string") return data.detail;
  const value = data && Object.values(data)[0];
  return (Array.isArray(value) ? value[0] : value) || fallback;
};

export function BlogManagement() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [state, setState] = useState("loading");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ category: "", tag: "", author: "", date_from: "", date_to: "" });
  const [options, setOptions] = useState({ categories: [], tags: [], users: [] });
  const [categoryName, setCategoryName] = useState("");
  const [message, setMessage] = useState("");
  const loadOptions = useCallback(() => Promise.all([api.get("admin/blog/categories/"), api.get("admin/blog/tags/"), api.get("admin/users/")]).then(([categories, tags, users]) => setOptions({ categories: unwrap(categories.data), tags: unwrap(tags.data), users: unwrap(users.data) })), []);
  const load = useCallback(() => {
    setState("loading");
    const params = new URLSearchParams({ page_size: "30" });
    if (status) params.set("status", status);
    if (search.trim()) params.set("q", search.trim());
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    api.get(`admin/blog/posts/?${params}`).then(({ data }) => { setPosts(unwrap(data)); setState("ready"); }).catch(() => setState("error"));
  }, [filters, search, status]);
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);
  useEffect(() => { loadOptions(); }, [loadOptions]);
  const create = async () => {
    const { data } = await api.post("admin/blog/posts/", { title: "مقاله بدون عنوان", excerpt: "", content: [], status: "draft" });
    navigate(`/admin/blog/${data.id}/edit`);
  };
  const action = async (post, name) => {
    if (name === "delete" && !window.confirm("این مقاله برای همیشه حذف شود؟")) return;
    try {
      if (name === "delete") await api.delete(`admin/blog/posts/${post.id}/`);
      else if (name === "duplicate") {
        const { data } = await api.post(`admin/blog/posts/${post.id}/duplicate/`);
        navigate(`/admin/blog/${data.id}/edit`);
        return;
      } else await api.post(`admin/blog/posts/${post.id}/${name}/`);
      setMessage("تغییر با موفقیت انجام شد."); load();
    } catch (error) { setMessage(firstError(error, "انجام این عملیات ممکن نشد.")); }
  };
  const manageCategory = async (category, actionName) => {
    try {
      if (actionName === "create") { if (!categoryName.trim()) return; await api.post("admin/blog/categories/", { name: categoryName.trim() }); setCategoryName(""); }
      if (actionName === "edit") { const name = window.prompt("نام تازه دسته‌بندی", category.name); if (!name?.trim()) return; await api.patch(`admin/blog/categories/${category.id}/`, { name: name.trim() }); }
      if (actionName === "archive") { if (!window.confirm(`دسته «${category.name}» غیرفعال شود؟ مقالات آن حذف نمی‌شوند.`)) return; await api.patch(`admin/blog/categories/${category.id}/`, { is_active: false }); }
      await loadOptions(); setMessage("دسته‌بندی به‌روزرسانی شد.");
    } catch (error) { setMessage(firstError(error, "ویرایش دسته‌بندی انجام نشد.")); }
  };
  return <div className="admin-page blog-admin-list">
    <div className="admin-page-head"><div><span className="admin-kicker">انتشارات بهارناژ</span><h1>مقالات / وبلاگ</h1></div><button className="admin-primary" onClick={create}>＋ مقاله جدید</button></div>
    {message && <div className="blog-admin-message">{message}</div>}
    <div className="blog-admin-toolbar"><div className="segmented">{[["","همه"],["published","منتشر شده"],["draft","پیش‌نویس"],["scheduled","زمان‌بندی شده"],["archived","آرشیو شده"]].map(([value,label]) => <button key={value} className={status === value ? "selected" : ""} onClick={() => setStatus(value)}>{label}</button>)}</div><input type="search" placeholder="جست‌وجوی عنوان، خلاصه یا نشانی" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
    <div className="blog-advanced-filters"><select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}><option value="">همه دسته‌ها</option>{options.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={filters.tag} onChange={(e) => setFilters({ ...filters, tag: e.target.value })}><option value="">همه برچسب‌ها</option>{options.tags.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={filters.author} onChange={(e) => setFilters({ ...filters, author: e.target.value })}><option value="">همه نویسندگان</option>{options.users.filter((item) => item.role === "admin").map((item) => <option key={item.id} value={item.id}>{[item.first_name,item.last_name].filter(Boolean).join(" ") || item.username}</option>)}</select><label>از تاریخ<JalaliDatePicker value={filters.date_from} onChange={(value) => setFilters({ ...filters, date_from: value })} /></label><label>تا تاریخ<JalaliDatePicker value={filters.date_to} onChange={(value) => setFilters({ ...filters, date_to: value })} /></label><button onClick={() => setFilters({ category: "", tag: "", author: "", date_from: "", date_to: "" })}>پاک‌کردن فیلترها</button></div>
    <section className="admin-panel blog-table-panel">
      {state === "loading" ? <div className="blog-list-state">در حال دریافت مقالات…</div> : state === "error" ? <div className="blog-list-state error">دریافت مقالات انجام نشد.</div> : !posts.length ? <div className="blog-list-state">هنوز مقاله‌ای با این فیلتر ثبت نشده است.</div> : <div className="blog-table-wrap"><table className="blog-table"><thead><tr><th>کاور</th><th>عنوان</th><th>دسته‌بندی</th><th>وضعیت</th><th>نویسنده</th><th>انتشار</th><th>آخرین ویرایش</th><th>ویژه</th><th></th></tr></thead><tbody>{posts.map((post) => <tr key={post.id}><td>{post.cover_image_url ? <img src={post.cover_image_url} alt="" /> : <i>بَ</i>}</td><td><strong>{post.title}</strong><small dir="ltr">/blog/{post.slug}</small></td><td>{post.category_detail?.name || "—"}</td><td><span className={`blog-status ${post.status}`}>{statusLabels[post.status]}</span></td><td>{post.author_name}</td><td>{faDate(post.published_at || post.scheduled_publish_at)}</td><td>{faDate(post.updated_at)}</td><td>{post.is_featured ? "★" : "—"}</td><td><div className="blog-row-actions"><Link to={`/admin/blog/${post.id}/edit`}>ویرایش</Link><Link to={`/admin/blog/${post.id}/preview`}>پیش‌نمایش</Link><button onClick={() => action(post, "duplicate")}>کپی</button>{post.status === "published" ? <button onClick={() => action(post, "unpublish")}>لغو انتشار</button> : <button onClick={() => action(post, "publish")}>انتشار</button>}<button onClick={() => action(post, "archive")}>آرشیو</button>{["draft","archived"].includes(post.status) && <button className="danger" onClick={() => action(post, "delete")}>حذف</button>}</div></td></tr>)}</tbody></table></div>}
    </section>
    <section className="admin-panel blog-category-manager"><div><span className="admin-kicker">ساختار مجله</span><h2>دسته‌بندی‌ها</h2><p>دسته‌های استفاده‌شده به‌جای حذف، غیرفعال می‌شوند تا ارتباط مقالات حفظ شود.</p></div><form onSubmit={(e) => { e.preventDefault(); manageCategory(null, "create"); }}><input placeholder="نام دسته‌بندی تازه" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} /><button className="admin-secondary">ایجاد دسته</button></form><div>{options.categories.map((category) => <article key={category.id}><span><strong>{category.name}</strong><small>{new Intl.NumberFormat("fa-IR").format(category.post_count || 0)} مقاله · {category.is_active ? "فعال" : "غیرفعال"}</small></span><button onClick={() => manageCategory(category, "edit")}>ویرایش</button>{category.is_active && <button onClick={() => manageCategory(category, "archive")}>غیرفعال‌کردن</button>}</article>)}</div></section>
  </div>;
}

function MarkdownTools({ value, onChange }) {
  const insert = (before, after = before, sample = "متن") => onChange(`${value || ""}${value ? " " : ""}${before}${sample}${after}`);
  return <div className="block-format-tools"><button type="button" onClick={() => insert("**", "**", "پررنگ")}>B</button><button type="button" onClick={() => insert("*", "*", "مورب")}>I</button><button type="button" onClick={() => insert("[", "](https://example.com)", "عنوان لینک")}>↗ لینک</button></div>;
}

function BlockEditor({ block, index, count, services, media, update, move, remove }) {
  const set = (changes) => update(index, { ...block, ...changes });
  return <article className="content-block-editor">
    <header><span>{index + 1} · {{ heading:"تیتر", paragraph:"پاراگراف", list:"فهرست", quote:"نقل‌قول", separator:"جداکننده", image:"تصویر", callout:"کادر نکته", service:"سرویس مرتبط", cta:"دعوت به رزرو" }[block.type]}</span><div><button type="button" disabled={!index} onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === count - 1} onClick={() => move(index, 1)}>↓</button><button type="button" className="danger" onClick={() => remove(index)}>×</button></div></header>
    {block.type === "heading" && <><select value={block.level} onChange={(e) => set({ level: Number(e.target.value) })}><option value="2">تیتر H2</option><option value="3">تیتر H3</option></select><MarkdownTools value={block.text} onChange={(text) => set({ text })} /><textarea rows="2" value={block.text} onChange={(e) => set({ text: e.target.value })} placeholder="عنوان این بخش" /></>}
    {["paragraph","quote"].includes(block.type) && <><MarkdownTools value={block.text} onChange={(text) => set({ text })} /><textarea rows={block.type === "paragraph" ? 6 : 3} value={block.text} onChange={(e) => set({ text: e.target.value })} placeholder={block.type === "paragraph" ? "متن این پاراگراف…" : "متن نقل‌قول…"} /></>}
    {block.type === "list" && <><select value={block.style} onChange={(e) => set({ style: e.target.value })}><option value="bullet">فهرست نشانه‌دار</option><option value="ordered">فهرست شماره‌دار</option></select><textarea rows="5" value={(block.items || []).join("\n")} onChange={(e) => set({ items: e.target.value.split("\n") })} placeholder="هر مورد را در یک خط بنویسید" /></>}
    {block.type === "separator" && <hr />}
    {block.type === "image" && (() => { const item = media.find((entry) => Number(entry.id) === Number(block.media_id)); return item ? <figure><img src={item.image_url} alt={item.alt_text} /><figcaption>{item.caption || item.alt_text}</figcaption></figure> : <p className="block-error">تصویر پیدا نشد؛ بلوک را حذف یا تصویر تازه‌ای اضافه کنید.</p>; })()}
    {block.type === "callout" && <div className="block-grid"><select value={block.tone} onChange={(e) => set({ tone: e.target.value })}><option value="note">یادداشت</option><option value="tip">نکته</option><option value="warning">هشدار</option></select><input value={block.title} onChange={(e) => set({ title: e.target.value })} placeholder="عنوان کادر" /><textarea rows="4" value={block.text} onChange={(e) => set({ text: e.target.value })} placeholder="متن کادر" /></div>}
    {block.type === "service" && <select value={block.service_id} onChange={(e) => set({ service_id: Number(e.target.value) })}><option value="">انتخاب سرویس واقعی</option>{services.map((service) => <option key={service.id} value={service.id}>{service.persian_name || service.name}</option>)}</select>}
    {block.type === "cta" && <div className="block-grid"><input value={block.title} onChange={(e) => set({ title: e.target.value })} placeholder="عنوان دعوت به رزرو" /><textarea rows="3" value={block.text} onChange={(e) => set({ text: e.target.value })} placeholder="توضیح کوتاه" /><div className="checkbox-grid">{services.map((service) => <label key={service.id}><input type="checkbox" checked={(block.service_ids || []).includes(service.id)} onChange={(e) => set({ service_ids: e.target.checked ? [...(block.service_ids || []), service.id] : (block.service_ids || []).filter((id) => id !== service.id) })} />{service.persian_name || service.name}</label>)}</div></div>}
  </article>;
}

export function BlogEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [options, setOptions] = useState({ categories: [], tags: [], services: [] });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newTag, setNewTag] = useState("");
  const [mediaForm, setMediaForm] = useState({ file: null, alt_text: "", caption: "" });
  const fetchPost = useCallback(() => api.get(`admin/blog/posts/${id}/`).then(({ data }) => setPost(data)).catch(() => navigate("/admin/blog")), [id, navigate]);
  const fetchOptions = useCallback(() => Promise.all([api.get("admin/blog/categories/?page_size=100"), api.get("admin/blog/tags/?page_size=100"), api.get("admin/services/?page_size=100")]).then(([categories, tags, services]) => setOptions({ categories: unwrap(categories.data), tags: unwrap(tags.data), services: unwrap(services.data) })), []);
  useEffect(() => { fetchPost(); fetchOptions(); }, [fetchOptions, fetchPost]);
  useEffect(() => {
    const beforeUnload = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    const guardLinks = (event) => { const anchor = event.target.closest("a"); if (dirty && anchor && !window.confirm("تغییرات ذخیره نشده‌اند. از صفحه خارج می‌شوید؟")) event.preventDefault(); };
    window.addEventListener("beforeunload", beforeUnload); document.addEventListener("click", guardLinks, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", guardLinks, true); };
  }, [dirty]);
  const change = (name, value) => { setPost((current) => ({ ...current, [name]: value })); setDirty(true); };
  const payload = useCallback(() => ({ title: post.title, slug: post.slug, excerpt: post.excerpt, content: post.content, cover_alt_text: post.cover_alt_text, category: post.category || null, tags: post.tags || [], status: post.status, scheduled_publish_at: post.scheduled_publish_at || null, seo_title: post.seo_title, seo_description: post.seo_description, is_featured: post.is_featured, related_services: post.related_services || [] }), [post]);
  const save = useCallback(async (quiet = false) => {
    if (!post || busy) return false;
    setBusy(true);
    try { const { data } = await api.patch(`admin/blog/posts/${id}/`, payload()); setPost(data); setDirty(false); if (!quiet) setNotice("همه تغییرات ذخیره شد."); return true; }
    catch (error) { setNotice(firstError(error, "ذخیره مقاله انجام نشد.")); return false; }
    finally { setBusy(false); }
  }, [busy, id, payload, post]);
  useEffect(() => {
    if (!dirty || post?.status !== "draft") return;
    const timer = setTimeout(() => save(true), 10000);
    return () => clearTimeout(timer);
  }, [dirty, post?.status, save]);
  const statusAction = async (action) => {
    if (!(await save())) return;
    setBusy(true);
    try { const body = action === "schedule" ? { scheduled_publish_at: post.scheduled_publish_at } : {}; const { data } = await api.post(`admin/blog/posts/${id}/${action}/`, body); setPost(data); setDirty(false); setNotice("وضعیت انتشار به‌روزرسانی شد."); }
    catch (error) { setNotice(firstError(error, "تغییر وضعیت انجام نشد.")); }
    finally { setBusy(false); }
  };
  const uploadField = async (field, file) => {
    if (!file) return;
    const form = new FormData(); form.append(field, file); if (field === "cover_image") form.append("cover_alt_text", post.cover_alt_text || post.title);
    setBusy(true);
    try { const { data } = await api.patch(`admin/blog/posts/${id}/`, form); setPost(data); setNotice("تصویر بارگذاری شد."); }
    catch (error) { setNotice(firstError(error, "بارگذاری تصویر انجام نشد.")); }
    finally { setBusy(false); }
  };
  const uploadMedia = async (event) => {
    event.preventDefault(); if (!mediaForm.file || !mediaForm.alt_text.trim() || busy) return;
    const form = new FormData(); form.append("post", id); form.append("image", mediaForm.file); form.append("alt_text", mediaForm.alt_text); form.append("caption", mediaForm.caption); form.append("display_order", post.media.length);
    setBusy(true);
    try { const { data } = await api.post("admin/blog/media/", form); setPost((current) => ({ ...current, media: [...current.media, data], content: [...current.content, { type: "image", media_id: data.id }] })); setMediaForm({ file: null, alt_text: "", caption: "" }); setDirty(true); setNotice("تصویر به انتهای مقاله اضافه شد؛ برای تعیین جای آن از دکمه‌های جابه‌جایی استفاده کنید."); }
    catch (error) { setNotice(firstError(error, "بارگذاری تصویر انجام نشد.")); }
    finally { setBusy(false); }
  };
  const updateMedia = async (media, changes, replacement) => {
    const form = new FormData();
    Object.entries(changes).forEach(([key, value]) => form.append(key, value));
    if (replacement) form.append("image", replacement);
    setBusy(true);
    try { const { data } = await api.patch(`admin/blog/media/${media.id}/`, form); setPost((current) => ({ ...current, media: current.media.map((item) => item.id === media.id ? data : item) })); setNotice("اطلاعات تصویر به‌روزرسانی شد."); }
    catch (error) { setNotice(firstError(error, "ویرایش تصویر انجام نشد.")); }
    finally { setBusy(false); }
  };
  const removeMedia = async (media) => {
    if (!window.confirm("این تصویر از کتابخانه و همه جای مقاله حذف شود؟")) return;
    setBusy(true);
    try { await api.delete(`admin/blog/media/${media.id}/`); setPost((current) => ({ ...current, media: current.media.filter((item) => item.id !== media.id), content: current.content.filter((block) => block.type !== "image" || Number(block.media_id) !== Number(media.id)) })); setDirty(true); setNotice("تصویر حذف شد؛ مقاله را ذخیره کنید."); }
    catch (error) { setNotice(firstError(error, "حذف تصویر انجام نشد.")); }
    finally { setBusy(false); }
  };
  const createOption = async (kind, name) => {
    if (!name.trim()) return;
    try { const { data } = await api.post(`admin/blog/${kind}/`, { name: name.trim() }); await fetchOptions(); if (kind === "categories") { change("category", data.id); setNewCategory(""); } else { change("tags", [...(post.tags || []), data.id]); setNewTag(""); } }
    catch (error) { setNotice(firstError(error, "ایجاد گزینه انجام نشد.")); }
  };
  const updateBlock = (index, block) => change("content", post.content.map((item, itemIndex) => itemIndex === index ? block : item));
  const moveBlock = (index, direction) => { const next = [...post.content]; const [item] = next.splice(index, 1); next.splice(index + direction, 0, item); change("content", next); };
  if (!post) return <div className="admin-page blog-editor-loading">در حال آماده‌سازی ویرایشگر…</div>;
  return <div className="admin-page blog-editor-page">
    <SEO title={`ویرایش ${post.title} | مدیریت بهارناژ`} description="ویرایش داخلی مقاله" noindex />
    <header className="blog-editor-head"><div><Link to="/admin/blog">مقالات ←</Link><span className="admin-kicker">{statusLabels[post.status]} · آخرین ویرایش {faDate(post.updated_at)}</span></div><div><Link className="admin-ghost" to={`/admin/blog/${id}/preview`}>پیش‌نمایش</Link><button type="button" className="admin-primary" disabled={busy || !dirty} onClick={() => save()}>{busy ? "در حال ذخیره…" : dirty ? "ذخیره تغییرات" : "ذخیره شده ✓"}</button></div></header>
    {notice && <div className="blog-admin-message">{notice}</div>}
    <div className="blog-editor-layout"><main className="blog-main-editor">
      <label className="blog-title-field"><span>عنوان مقاله</span><textarea rows="2" value={post.title} onChange={(e) => change("title", e.target.value)} /></label>
      <label><span>خلاصه کوتاه</span><textarea rows="4" maxLength="500" value={post.excerpt} onChange={(e) => change("excerpt", e.target.value)} /><small>{post.excerpt.length}/۵۰۰ · برای کارت‌ها و معرفی ابتدای مقاله</small></label>
      <section className="block-editor"><header><div><span className="admin-kicker">ARTICLE BUILDER</span><h2>محتوای مقاله</h2></div><small>برای پررنگ، مورب و لینک از ابزار هر بلوک استفاده کنید.</small></header>
        <div className="add-block-toolbar">{[["paragraph","پاراگراف"],["heading","تیتر"],["list","فهرست"],["quote","نقل‌قول"],["separator","جداکننده"],["callout","کادر نکته"],["service","سرویس"],["cta","دعوت به رزرو"]].map(([type,label]) => <button type="button" key={type} onClick={() => change("content", [...post.content, blankBlock(type)])}>＋ {label}</button>)}</div>
        {!post.content.length && <div className="empty-blocks">مقاله هنوز بلوکی ندارد. با یک پاراگراف یا تیتر شروع کنید.</div>}
        {post.content.map((block, index) => <BlockEditor key={`${block.type}-${index}`} block={block} index={index} count={post.content.length} services={options.services} media={post.media} update={updateBlock} move={moveBlock} remove={(at) => change("content", post.content.filter((_, index) => index !== at))} />)}
        <form className="article-media-uploader" onSubmit={uploadMedia}><h3>افزودن تصویر محتوایی</h3><p>متن جایگزین، خودِ تصویر را کوتاه و واقعی توصیف می‌کند؛ آن را با کلمات کلیدی پر نکنید.</p><label>فایل تصویر<input required type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => setMediaForm({ ...mediaForm, file: e.target.files[0] })} /></label><label>متن جایگزین<input required maxLength="220" value={mediaForm.alt_text} onChange={(e) => setMediaForm({ ...mediaForm, alt_text: e.target.value })} /></label><label>کپشن اختیاری<input maxLength="320" value={mediaForm.caption} onChange={(e) => setMediaForm({ ...mediaForm, caption: e.target.value })} /></label><button className="admin-secondary" disabled={busy}>بارگذاری و افزودن به مقاله</button></form>
        {!!post.media.length && <section className="article-media-library"><h3>کتابخانه تصاویر این مقاله</h3><div>{post.media.map((item) => <article key={item.id}><img src={item.image_url} alt={item.alt_text} /><label>متن جایگزین<input defaultValue={item.alt_text} onBlur={(e) => e.target.value !== item.alt_text && updateMedia(item, { alt_text: e.target.value, caption: item.caption, post: id, display_order: item.display_order })} /></label><label>کپشن<input defaultValue={item.caption} onBlur={(e) => e.target.value !== item.caption && updateMedia(item, { alt_text: item.alt_text, caption: e.target.value, post: id, display_order: item.display_order })} /></label><label className="replace-media">جایگزینی فایل<input type="file" accept="image/*" onChange={(e) => updateMedia(item, { alt_text: item.alt_text, caption: item.caption, post: id, display_order: item.display_order }, e.target.files[0])} /></label><button type="button" className="media-delete" onClick={() => removeMedia(item)}>حذف تصویر</button></article>)}</div></section>}
      </section>
    </main><aside className="blog-settings">
      <section><h3>انتشار</h3><span className={`blog-status ${post.status}`}>{statusLabels[post.status]}</span><label>زمان‌بندی انتشار<input type="datetime-local" value={post.scheduled_publish_at ? post.scheduled_publish_at.slice(0,16) : ""} onChange={(e) => change("scheduled_publish_at", e.target.value ? new Date(e.target.value).toISOString() : null)} /></label><div className="publish-actions">{post.status !== "published" && <button type="button" className="admin-success" disabled={busy} onClick={() => statusAction("publish")}>انتشار اکنون</button>}<button type="button" disabled={busy || !post.scheduled_publish_at} onClick={() => statusAction("schedule")}>زمان‌بندی</button>{post.status === "published" && <button type="button" onClick={() => statusAction("unpublish")}>لغو انتشار</button>}<button type="button" onClick={() => statusAction("archive")}>آرشیو</button></div></section>
      <section><h3>نشانی مقاله</h3><label>نشانی مقاله<input dir="ltr" value={post.slug} onChange={(e) => change("slug", e.target.value)} /></label>{post.status === "published" && <p className="setting-warning">تغییر این مقدار، نشانی عمومی مقاله را تغییر می‌دهد و ممکن است لینک‌های قبلی را بشکند.</p>}</section>
      <section><h3>تصویر کاور</h3>{post.cover_image_url && <img className="cover-preview" src={post.cover_image_url} alt={post.cover_alt_text || "پیش‌نمایش کاور"} />}<label>انتخاب / جایگزینی<input type="file" accept="image/*" onChange={(e) => uploadField("cover_image", e.target.files[0])} /></label><label>متن جایگزین<input maxLength="220" value={post.cover_alt_text} onChange={(e) => change("cover_alt_text", e.target.value)} /></label><small>این متن باید تصویر را برای فردی که آن را نمی‌بیند توصیف کند.</small></section>
      <section><h3>دسته‌بندی</h3><select value={post.category || ""} onChange={(e) => change("category", e.target.value ? Number(e.target.value) : null)}><option value="">بدون دسته‌بندی</option>{options.categories.map((item) => <option value={item.id} key={item.id}>{item.name}{!item.is_active ? " (غیرفعال)" : ""}</option>)}</select><div className="inline-create"><input placeholder="دسته تازه" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} /><button type="button" onClick={() => createOption("categories", newCategory)}>ایجاد</button></div></section>
      <section><h3>برچسب‌ها</h3><div className="checkbox-grid">{options.tags.map((tag) => <label key={tag.id}><input type="checkbox" checked={(post.tags || []).includes(tag.id)} onChange={(e) => change("tags", e.target.checked ? [...post.tags, tag.id] : post.tags.filter((id) => id !== tag.id))} />{tag.name}</label>)}</div><div className="inline-create"><input placeholder="برچسب تازه" value={newTag} onChange={(e) => setNewTag(e.target.value)} /><button type="button" onClick={() => createOption("tags", newTag)}>ایجاد</button></div></section>
      <section><h3>سرویس‌های مرتبط</h3><div className="checkbox-grid">{options.services.map((service) => <label key={service.id}><input type="checkbox" checked={(post.related_services || []).includes(service.id)} onChange={(e) => change("related_services", e.target.checked ? [...post.related_services, service.id] : post.related_services.filter((id) => id !== service.id))} />{service.persian_name || service.name}</label>)}</div></section>
      <section><h3>نمایش</h3><label className="check-line"><input type="checkbox" checked={post.is_featured} onChange={(e) => change("is_featured", e.target.checked)} />مقاله ویژه</label></section>
      <PanelDisclosure title="نمایش در گوگل و اشتراک‌گذاری (اختیاری)"><label>عنوان در جست‌وجو<input maxLength="160" value={post.seo_title} onChange={(e) => change("seo_title", e.target.value)} /><small>{post.seo_title.length}/۱۶۰</small></label><label>توضیح در جست‌وجو<textarea rows="4" maxLength="320" value={post.seo_description} onChange={(e) => change("seo_description", e.target.value)} /><small>{post.seo_description.length}/۳۲۰</small></label>{post.og_image_url && <img className="cover-preview" src={post.og_image_url} alt="پیش‌نمایش شبکه اجتماعی" />}<label>تصویر اختصاصی اشتراک‌گذاری<input type="file" accept="image/*" onChange={(e) => uploadField("og_image", e.target.files[0])} /></label></PanelDisclosure>
    </aside></div>
  </div>;
}

export function BlogPreview() {
  const { id } = useParams(); const [post, setPost] = useState(null);
  useEffect(() => { api.get(`admin/blog/posts/${id}/`).then(({ data }) => setPost(data)); }, [id]);
  const services = post?.related_service_details || [];
  return <div className="admin-page blog-preview-page"><SEO title="پیش‌نمایش مقاله | بهارناژ" description="پیش‌نمایش خصوصی" noindex /><header><div><span className="admin-kicker">پیش‌نمایش خصوصی · بدون ایندکس</span><h1>{post?.title || "در حال دریافت…"}</h1></div><Link className="admin-primary" to={`/admin/blog/${id}/edit`}>بازگشت به ویرایش</Link></header>{post && <article className="preview-canvas"><span>{post.category_detail?.name || "مجله بهارناژ"}</span><h1>{post.title}</h1>{post.excerpt && <p className="preview-excerpt">{post.excerpt}</p>}{post.cover_image_url && <img className="preview-hero" src={post.cover_image_url} alt={post.cover_alt_text || post.title} />}<BlogContent blocks={post.content} media={post.media} services={services} /></article>}</div>;
}
