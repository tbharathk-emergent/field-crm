import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  MapPin, Users, FileText, Wallet, ShoppingCart, ClipboardList,
  MessageSquare, Package, Bell, LogIn, LogOut, ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useApp, getLabel } from "@/context/AppContext";

export default function Home() {
  const { tenant, user, t } = useApp();
  const { slug } = useParams();
  const [att, setAtt] = useState(null);
  const [loading, setLoading] = useState(false);

  const base = `/t/${slug}/app`;

  useEffect(() => {
    api.get("/employee/attendance/today").then(r => setAtt(r.data)).catch(() => {});
  }, []);

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
      toast.success("Checked in!");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setLoading(false); }
  };
  const checkOut = async () => {
    setLoading(true);
    try {
      const loc = await captureLocation();
      const res = await api.post("/employee/checkout", loc);
      setAtt(res.data);
      toast.success("Checked out!");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setLoading(false); }
  };

  const card = (Icon, label, to, color = "var(--brand-primary)", testid) => (
    <Link to={to} data-testid={testid} className="pwa-card hover:shadow-md transition-all">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2" style={{ background: `${color}1A`, color }}>
        <Icon size={22} />
      </div>
      <div className="text-sm font-medium text-brand-ink">{label}</div>
    </Link>
  );

  const checkedIn = att && att.check_in_at && !att.check_out_at;
  const checkedOut = att && att.check_out_at;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-brand-mute">{t("welcome")},</div>
        <h1 className="font-display text-2xl font-bold">{user?.name}</h1>
      </div>

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
            {checkedOut ? "Completed" : checkedIn ? "Active" : "Not Started"}
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
        {card(Users, getLabel(tenant, "dealer_plural", t("my_dealers")), `${base}/dealers`, "#2C5E43", "card-dealers")}
        {card(FileText, t("visit_report"), `${base}/visit`, "#D35400", "card-visit")}
        {card(Wallet, t("collection_entry"), `${base}/collection`, "#16A085", "card-collection")}
        {card(ShoppingCart, t("sales_entry"), `${base}/sales`, "#2980B9", "card-sales")}
        {card(ClipboardList, t("dcr"), `${base}/dcr`, "#8E44AD", "card-dcr")}
        {card(MessageSquare, getLabel(tenant, "customer", t("customer")) + " " + (t("enquiries") || "Enquiry"), `${base}/enquiry`, "#E67E22", "card-enquiry")}
        {card(Package, t("catalogue"), `${base}/catalogue`, "#3498DB", "card-catalogue")}
        {card(Bell, t("notifications"), `${base}/notifications`, "#E74C3C", "card-notifications")}
      </div>
    </div>
  );
}
