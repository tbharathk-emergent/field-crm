import React, { useEffect, useState } from "react";
import { Users, ShoppingBag, Wallet, AlertCircle, Package, MapPin, TrendingUp, MessageSquare } from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, BarChart, Bar, CartesianGrid } from "recharts";
import { api } from "@/lib/api";
import { useApp, getLabel } from "@/context/AppContext";

const Kpi = ({ icon: Icon, label, value, accent, testid }) => (
  <div data-testid={testid} className="card-surface p-5">
    <div className="flex items-center justify-between mb-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${accent}1A`, color: accent }}>
        <Icon size={18} />
      </div>
      <span className="label-up">{label}</span>
    </div>
    <div className="kpi-num">{value}</div>
  </div>
);

export default function AdminDashboard() {
  const { tenant, t } = useApp();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/analytics/tenant").then((r) => setData(r.data));
  }, []);

  const k = data?.kpis || {};
  const fmt = (n) => typeof n === "number" ? n.toLocaleString("en-IN") : n;
  const fmtCur = (n) => `₹${fmt(Math.round(n || 0))}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">{t("dashboard")}</h1>
        <p className="text-brand-mute text-sm mt-1">{tenant?.name} · overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Kpi icon={Users} label="Staff" value={k.employees ?? "—"} accent="#2C5E43" testid="kpi-employees" />
        <Kpi icon={ShoppingBag} label={getLabel(tenant, "customer_plural", "Customers")} value={k.customers ?? "—"} accent="#D35400" testid="kpi-customers" />
        <Kpi icon={Package} label={getLabel(tenant, "product_plural", "Products")} value={k.products ?? "—"} accent="#2980B9" testid="kpi-products" />
        <Kpi icon={MapPin} label="Today Att." value={k.attendance_today ?? "—"} accent="#27AE60" testid="kpi-attendance" />
        <Kpi icon={TrendingUp} label="Sales" value={fmtCur(k.sales_total)} accent="#E67E22" testid="kpi-sales" />
        <Kpi icon={Wallet} label="Collections" value={fmtCur(k.collections_total)} accent="#16A085" testid="kpi-collections" />
        <Kpi icon={AlertCircle} label="Outstanding" value={fmtCur(k.outstanding_total)} accent="#E74C3C" testid="kpi-outstanding" />
        <Kpi icon={ShoppingBag} label="Orders" value={k.orders_total ?? "—"} accent="#9B59B6" testid="kpi-orders" />
        <Kpi icon={ShoppingBag} label="Pending Orders" value={k.orders_pending ?? "—"} accent="#F39C12" testid="kpi-orders-pending" />
        <Kpi icon={MessageSquare} label="Open Enquiries" value={k.enquiries_open ?? "—"} accent="#3498DB" testid="kpi-enquiries" />
        <Kpi icon={MapPin} label="Visits" value={k.visits_total ?? "—"} accent="#1ABC9C" testid="kpi-visits" />
        <Kpi icon={TrendingUp} label="Sales count" value={k.sales_count ?? "—"} accent="#34495E" testid="kpi-salescount" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-surface p-5 lg:col-span-2">
          <h2 className="font-display text-lg font-semibold mb-4">Sales — Last 7 days</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.sales_trend || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="var(--brand-primary)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-surface p-5">
          <h2 className="font-display text-lg font-semibold mb-4">Top Employees</h2>
          <div className="space-y-3">
            {(data?.top_employees || []).map((e, i) => (
              <div key={e.user_id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-primary/10 text-brand-primary font-display font-bold flex items-center justify-center text-sm">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{e.name}</div>
                  <div className="text-xs text-brand-mute">{fmtCur(e.total)}</div>
                </div>
              </div>
            ))}
            {(!data?.top_employees || data.top_employees.length === 0) && (
              <div className="text-sm text-brand-mute">{t("no_data")}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
