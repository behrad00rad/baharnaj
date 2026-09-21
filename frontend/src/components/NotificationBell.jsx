import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api } from "../shared/api";
import { disableCurrentFirebaseDevice, enableFirebaseDevice, syncFirebaseDevice } from "../shared/firebasePush";
import { formatJalaliDateTime, formatJalaliDatesInText } from "../shared/date";
import {
  listenForForegroundMessages,
} from "../shared/firebase";
import "./Notifications.css";

function PushPermissionButton({ onNotificationSent, enabled, onEnabled }) {
  const supported = "serviceWorker" in navigator && "Notification" in window;
  const [state, setState] = useState(
    supported ? Notification.permission : "unsupported",
  );
  const [message, setMessage] = useState("");

  const enable = async () => {
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission);
        setMessage(
          permission === "denied"
            ? "اجازه اعلان در مرورگر مسدود شده است."
            : "فعال‌سازی اعلان لغو شد.",
        );
        return;
      }
      await enableFirebaseDevice();
      onEnabled(true);
      setState("enabled");
      setMessage("اعلان‌های این دستگاه فعال شد.");
    } catch (error) {
      setMessage(error.message || "فعال‌سازی اعلان در حال حاضر ممکن نیست.");
    }
  };

  const disable = async () => {
    try {
      await disableCurrentFirebaseDevice({ explicit: true });
      onEnabled(false);
      setState("granted");
      setMessage("اعلان‌های این دستگاه غیرفعال شد.");
    } catch { setMessage("غیرفعال‌سازی کامل نشد؛ دوباره تلاش کنید."); }
  };

  const test = async () => {
    setMessage("در حال ارسال اعلان آزمایشی…");
    try {
      await api.post("firebase-devices/test/");
      setMessage(
        "اعلان آزمایشی در پنل ثبت شد. دریافت اعلان مرورگر را هم بررسی کنید.",
      );
      onNotificationSent();
    } catch {
      setMessage("ارسال اعلان آزمایشی ناموفق بود.");
    }
  };

  if (!supported)
    return (
      <small className="push-message">
        مرورگر شما از اعلان Push پشتیبانی نمی‌کند.
      </small>
    );
  const statusMessage =
    message ||
    (state === "denied" ? "اجازه اعلان در تنظیمات مرورگر مسدود شده است." : "");
  return (
    <div className="push-setting">
      <span>اعلان‌های مرورگر: {enabled ? "فعال" : "غیرفعال"}</span>
      <div className="push-actions">
        <button
          type="button"
          onClick={enabled ? disable : enable}
          disabled={state === "denied"}
        >
          {enabled ? "غیرفعال‌سازی" : "فعال‌سازی اعلان‌ها"}
        </button>
        {enabled && (
          <button type="button" onClick={test}>
            ارسال آزمایشی
          </button>
        )}
      </div>
      {statusMessage && <small className="push-message">{statusMessage}</small>}
    </div>
  );
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const root = useRef(null);
  const panel = useRef(null);
  const [enabled, setEnabled] = useState(false);
  const [foreground, setForeground] = useState(null);
  const [mobileDocked, setMobileDocked] = useState(() => window.matchMedia?.("(max-width: 650px)").matches || false);
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 650px)");
    if (!media) return undefined;
    const update = () => setMobileDocked(media.matches);
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  useEffect(() => {
    let active = true;
    const sync = () => syncFirebaseDevice().then(value => { if (active) setEnabled(value); }).catch(() => { if (active) setEnabled(false); });
    sync();
    window.addEventListener("focus", sync);
    const timer = window.setInterval(sync, 60 * 60 * 1000);
    return () => { active = false; window.removeEventListener("focus", sync); window.clearInterval(timer); };
  }, []);

  const refreshCount = useCallback(
    () =>
      api
        .get("notifications/unread-count/")
        .then(({ data }) => setUnread(data.count))
        .catch(() => {}),
    [],
  );
  const refreshList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("notifications/");
      setNotifications((data.results || data).slice(0, 12));
    } catch {
      setError("دریافت اعلان‌ها ممکن نیست.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCount();
    const timer = window.setInterval(refreshCount, 45000);
    return () => window.clearInterval(timer);
  }, [refreshCount]);
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    listenForForegroundMessages((payload) => {
      setForeground(payload.data || null);
      refreshCount();
      if (open) refreshList();
    })
      .then((cleanup) => {
        if (!active) {
          cleanup();
          return;
        }
        unsubscribe = cleanup;
      })
      .catch(() => {});
    return () => {
      active = false;
      unsubscribe();
    };
  }, [open, refreshCount, refreshList]);
  useEffect(() => {
    const close = (event) => {
      if (!root.current?.contains(event.target) && !panel.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => {
    if (!open || !mobileDocked) return undefined;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; };
  }, [mobileDocked, open]);

  const select = async (notification) => {
    if (!notification.is_read) {
      try {
        await api.post(`notifications/${notification.id}/read/`);
        refreshCount();
      } catch { setError("به‌روزرسانی اعلان ممکن نیست؛ دوباره تلاش کنید."); return; }
    }
    setOpen(false);
    if (notification.target_url?.startsWith("/") && !notification.target_url.startsWith("//") && !notification.target_url.includes("\\"))
      navigate(notification.target_url);
  };
  const readAll = async () => {
    try {
      await api.post("notifications/read-all/");
      setNotifications((items) =>
        items.map((item) => ({ ...item, is_read: true })),
      );
      setUnread(0);
    } catch {
      setError("به‌روزرسانی اعلان‌ها ممکن نیست.");
    }
  };
  const toggle = () => {
    if (!open) refreshList();
    setOpen((value) => !value);
  };
  const notificationSent = () => {
    refreshList();
    refreshCount();
  };
  const content = (
    <div className="notification-root" ref={root}>
      <button
        className="notification-bell"
        type="button"
        title="اعلان‌ها"
        aria-label={`اعلان‌ها، ${unread} خوانده‌نشده`}
        aria-expanded={open}
        onClick={toggle}
      >
        <span className="notification-bell-icon" aria-hidden="true">◔</span>
        <span className="notification-bell-label">اعلان‌ها</span>
        {unread > 0 && (
          <b>{unread > 99 ? "۹۹+" : unread.toLocaleString("fa-IR")}</b>
        )}
      </button>
      {foreground && createPortal(<div className="notification-toast" role="status"><button onClick={() => { setOpen(true); refreshList(); setForeground(null); }}>{foreground.title}<span>{foreground.body}</span></button><button aria-label="بستن اعلان" onClick={() => setForeground(null)}>×</button></div>, document.querySelector(".admin-app") || document.body)}
      {open && (
        createPortal(<section className="notification-panel" ref={panel}>
          <header>
            <strong>اعلان‌ها</strong>
            <div>
              {unread > 0 && <button type="button" onClick={readAll}>خواندن همه</button>}
              <button className="notification-close" type="button" aria-label="بستن اعلان‌ها" onClick={() => setOpen(false)}>×</button>
            </div>
          </header>
          <div className="notification-list">
            {loading && <p>در حال دریافت…</p>}
            {error && <p className="notification-error">{error}</p>}
            {!loading && !error && !notifications.length && (
              <p>اعلان تازه‌ای ندارید.</p>
            )}
            {notifications.map((item) => (
              <button
                type="button"
                className={item.is_read ? "" : "unread"}
                onClick={() => select(item)}
                key={item.id}
              >
                <strong>{item.title}</strong>
                <span>{formatJalaliDatesInText(item.message)}</span>
                <time dateTime={item.created_at}>
                  {formatJalaliDateTime(item.created_at, "زمان نامشخص")}
                </time>
              </button>
            ))}
          </div>
          <PushPermissionButton onNotificationSent={notificationSent} enabled={enabled} onEnabled={setEnabled} />
        </section>, document.querySelector(".admin-app") || document.body)
      )}
    </div>
  );
  return mobileDocked ? createPortal(content, document.querySelector(".admin-app") || document.body) : content;
}
