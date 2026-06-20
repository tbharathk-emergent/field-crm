import React, { useEffect, useState } from "react";
import { Building2, Users, ShoppingBag, MapPin, TrendingUp, Tag } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";

const KPI = ({ icon: Icon, label, value, hint, testid }) => (
  <div data-testid={testid} className="card-surface p-5">
    <div className="flex items-center justify-between mb-3">
      <div className="w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
        <Icon size={18} />
      </div>
      <span className="label-up">{label}</span>
    </div>
    <div className="kpi-num">{value}</div>
    {hint && <div className="text-xs text-brand-mute mt-1">{hint}</div>}
  </div>
);

export default function SuperDashboard() {
  const { t } = useApp();
  const [stats, setStats] = useState(null);
  const [tenants, setTenants] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get("/super/analytics").then((r) => setStats(r.data.totals)),
      api.get("/super/tenants").then((r) => setTenants(r.data)),
    ]).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{t("dashboard")}</h1>
        <p className="text-brand-mute text-sm mt-1">Platform-wide overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPI icon={Building2} label={t("tenants")} value={stats?.tenants ?? "—"} hint={`${stats?.active_tenants ?? 0} active`} testid="kpi-tenants" />
        <KPI icon={Users} label="Users" value={stats?.users ?? "—"} testid="kpi-users" />
        <KPI icon={ShoppingBag} label={t("orders")} value={stats?.orders ?? "—"} testid="kpi-orders" />
        <KPI icon={MapPin} label="Visits" value={stats?.visits ?? "—"} testid="kpi-visits" />
        <KPI icon={Tag} label={t("plans")} value={stats?.plans ?? "—"} testid="kpi-plans" />
        <KPI icon={TrendingUp} label="Growth" value="—" hint="Coming soon" testid="kpi-growth" />
      </div>

      <div className="card-surface p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold">Recent Tenants</h2>
          <a href="/super-admin/tenants" className="text-sm text-brand-primary">View all →</a>
        </div>
        <div className="divide-y divide-brand-line">
          {tenants.slice(0, 6).map((tn) => (
            <div key={tn.id} className="py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-display font-bold flex-shrink-0"
                  style={{ background: tn.theme?.primary || "#2C5E43" }}>
                  {tn.name?.[0] || "T"}
                </div>
                <div className="min-w-0">
                  <div className="font-medium truncate">{tn.name}</div>
                  <div className="text-xs text-brand-mute">/t/{tn.slug} · {tn.business_type}</div>
                </div>
              </div>
              <div className="text-right text-xs text-brand-mute">
                <div>{tn.stats?.employees ?? 0} staff</div>
                <div>{tn.stats?.customers ?? 0} customers</div>
              </div>
            </div>
          ))}
          {tenants.length === 0 && <div className="py-6 text-center text-brand-mute text-sm">{t("no_data")}</div>}
        </div>
      </div>
    </div>
  );
}
