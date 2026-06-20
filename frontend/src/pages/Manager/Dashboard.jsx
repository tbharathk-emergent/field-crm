import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Users, MapPin, TrendingUp, Wallet } from "lucide-react";
import { useApp } from "@/context/AppContext";

const Kpi = ({ icon: Icon, label, value }) => (
  <div className="card-surface p-5">
    <div className="flex items-center justify-between mb-3">
      <div className="w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center"><Icon size={18} /></div>
      <span className="label-up">{label}</span>
    </div>
    <div className="kpi-num">{value}</div>
  </div>
);

export default function ManagerDashboard() {
  const { t } = useApp();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/analytics/tenant").then((r) => setData(r.data)).catch(() => {});
  }, []);

  const k = data?.kpis || {};
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Manager {t("dashboard")}</h1>
        <p className="text-brand-mute text-sm mt-1">Your team's snapshot</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi icon={Users} label="Team" value={k.employees ?? "—"} />
        <Kpi icon={MapPin} label={t("today")} value={k.attendance_today ?? "—"} />
        <Kpi icon={TrendingUp} label={t("sales")} value={`₹${Math.round(k.sales_total || 0).toLocaleString("en-IN")}`} />
        <Kpi icon={Wallet} label={t("collections")} value={`₹${Math.round(k.collections_total || 0).toLocaleString("en-IN")}`} />
      </div>
      <div className="card-surface p-5">
        <h2 className="font-display font-semibold mb-3">Top Performers</h2>
        <div className="space-y-2">
          {(data?.top_employees || []).map((e, i) => (
            <div key={e.user_id} className="flex items-center gap-3 py-2 border-b border-brand-line last:border-0">
              <div className="w-8 h-8 rounded-lg bg-brand-primary/10 text-brand-primary font-display font-bold flex items-center justify-center text-sm">{i + 1}</div>
              <div className="flex-1">{e.name}</div>
              <div className="font-mono text-sm">₹{Math.round(e.total).toLocaleString("en-IN")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
