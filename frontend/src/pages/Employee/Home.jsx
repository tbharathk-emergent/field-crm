import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  MapPin, Users, FileText, Wallet, ShoppingCart, ClipboardList,
  MessageSquare, Package, Bell, LogIn, LogOut, ChevronRight, CalendarDays, Target as TargetIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useApp, getLabel } from "@/context/AppContext";
import { postOrQueue } from "@/lib/offline";
import { startTracking, stopTracking, resumeIfActive } from "@/lib/gpsTracker";
import OfflineIndicator from "@/components/OfflineIndicator";

export default function Home() {
  const { tenant, user, t, can } = useApp();
  const { slug } = useParams();
  const [att, setAtt] = useState(null);
  const [target, setTarget] = useState(null);
  const [loading, setLoading] = useState(false);

  const base = `/t/${slug}/app`;

  useEffect(() => {
    api.get("/employee/attendance/today").then(r => setAtt(r.data)).catch(() => {});
    api.get("/targets/progress").then(r => {
      const row = (r.data.rows || []).find(x => x.user_id === user?.id);
      if (row) setTarget(row);
    }).catch(() => {});
    // Resume GPS if we were tracking before reload
    resumeIfActive();
  }, [user]);

  const captureLocation = () => new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({}),
      { timeout: 8000, enableHighAccuracy: true }
    );
  });

  const checkIn = async () => {
    setLoading(true);
    try {
      const loc = await captureLocation();
      const res = await api.post("/employee/checkin", loc);
      setAtt(res.data);
      startTracking();
      toast.success("Checked in! GPS tracking started.");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setLoading(false); }
  };
  const checkOut = async () => {
    setLoading(true);
    try {
      const loc = await captureLocation();
      const res = await api.post("/employee/checkout", loc);
      setAtt(res.data);
      stopTracking();
      toast.success("Checked out!");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setLoading(false); }
  };

  const card = (Icon, label, to, color = "var(--brand-primary)", testid, perm) => {
    if (perm && !can(perm, "read")) return null;
    return (
      <Link to={to} data-testid={testid} className="pwa-card hover:shadow-md transition-all">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2" style={{ background: `${color}1A`, color }}>
          <Icon size={22} />
        </div>
        <div className="text-sm font-medium text-brand-ink">{label}</div>
      </Link>
    );
  };

  const checkedIn = att && att.check_in_at && !att.check_out_at;
  const checkedOut = att && att.check_out_at;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-brand-mute">{t("welcome")},</div>
          <h1 className="font-display text-2xl font-bold">{user?.name}</h1>
        </div>
        <OfflineIndicator />
      </div>

      {/* Target progress */}
      {target && target.target > 0 && (
        <div className="card-surface p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TargetIcon className="text-brand-primary" size={16} />
              <div className="label-up">This month · Target</div>
            </div>
            <div className="text-xs font-mono text-brand-mute">{target.month}</div>
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="font-display text-2xl font-bold">₹{Math.round(target.actual).toLocaleString("en-IN")}</span>
            <span className="text-sm text-brand-mute">/ ₹{target.target.toLocaleString("en-IN")}</span>
          </div>
          <div className="h-2 rounded-full bg-brand-line overflow-hidden">
            <div className="h-full transition-all" style={{
              width: `${Math.min(100, target.percent)}%`,
              background: target.percent >= 100 ? "#27AE60" : target.percent >= 60 ? "#F39C12" : "#E74C3C",
            }} />
          </div>
          <div className="mt-1 text-right text-xs font-mono">{target.percent}% achieved</div>
        </div>
      )}

      {/* Attendance card */}
      <div className="card-surface p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="label-up">{t("today")} · {t("attendance")}</div>
            {att?.check_in_at && (
              <div className="text-xs text-brand-mute mt-1">
                In: {new Date(att.check_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                {att.check_out_at && ` · Out: ${new Date(att.check_out_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`}
              </div>
            )}
          </div>
          <div className={`text-xs px-2 py-1 rounded-full font-semibold ${checkedOut ? "bg-emerald-100 text-emerald-700" : checkedIn ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-600"}`}>
            {checkedOut ? "Completed" : checkedIn ? "Tracking GPS" : "Not Started"}
          </div>
        </div>
        {!checkedIn && !checkedOut && (
          <button data-testid="checkin-btn" onClick={checkIn} disabled={loading} className="btn-primary w-full h-14 text-base">
            <LogIn size={18} /> {t("check_in")}
          </button>
        )}
        {checkedIn && (
          <button data-testid="checkout-btn" onClick={checkOut} disabled={loading} className="btn-secondary w-full h-14 text-base">
            <LogOut size={18} /> {t("check_out")}
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-3">
        {card(Users, getLabel(tenant, "dealer_plural", t("my_dealers")), `${base}/dealers`, "#2C5E43", "card-dealers", "dealers")}
        {card(FileText, t("visit_report"), `${base}/visit`, "#D35400", "card-visit", "visits")}
        {card(Wallet, t("collection_entry"), `${base}/collection`, "#16A085", "card-collection", "collections")}
        {card(ShoppingCart, t("sales_entry"), `${base}/sales`, "#2980B9", "card-sales", "sales")}
        {card(ClipboardList, t("dcr"), `${base}/dcr`, "#8E44AD", "card-dcr", "dcr")}
        {card(MessageSquare, getLabel(tenant, "customer", t("customer")) + " Enquiry", `${base}/enquiry`, "#E67E22", "card-enquiry", "enquiries")}
        {card(Package, t("catalogue"), `${base}/catalogue`, "#3498DB", "card-catalogue", "products")}
        {card(CalendarDays, "Leaves", `${base}/leaves`, "#9B59B6", "card-leaves", "leaves")}
        {card(Bell, t("notifications"), `${base}/notifications`, "#E74C3C", "card-notifications")}
      </div>
    </div>
  );
}

