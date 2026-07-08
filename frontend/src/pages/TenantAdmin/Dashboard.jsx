import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Users, ShoppingBag, Wallet, AlertCircle, Package, MapPin, TrendingUp,
  MessageSquare, Target as TargetIcon, CalendarDays, ChevronRight,
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { api } from "@/lib/api";
import { useApp, getLabel } from "@/context/AppContext";

const Kpi = ({ icon: Icon, label, value, accent, testid, to }) => (
  <Link to={to} data-testid={testid} className="card-surface p-4 hover:shadow-md active:scale-[0.98] transition-all block">
    <div className="flex items-center justify-between mb-2">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${accent}1A`, color: accent }}>
        <Icon size={18} />
      </div>
      <ChevronRight size={16} className="text-brand-mute" />
    </div>
    <div className="text-[11px] uppercase tracking-wider text-brand-mute font-medium">{label}</div>
    <div className="font-display text-xl font-bold mt-0.5 tracking-tight truncate">{value}</div>
  </Link>
);

export default function AdminDashboard() {
  const { tenant, t } = useApp();
  const { slug } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/analytics/tenant").then((r) => setData(r.data));
  }, []);

  const k = data?.kpis || {};
  const fmt = (n) => typeof n === "number" ? n.toLocaleString("en-IN") : "—";
  const fmtCur = (n) => `₹${fmt(Math.round(n || 0))}`;
  const base = `/t/${slug}/admin`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Hi, {tenant?.name ? tenant.name.split(" ")[0] : "Admin"}</h1>
        <p className="text-brand-mute text-xs mt-0.5">Tap any tile to drill in</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Kpi icon={Users} label="Staff" value={fmt(k.employees)} accent="#2C5E43"
             testid="kpi-employees" to={`${base}/employees`} />
        <Kpi icon={ShoppingBag} label={getLabel(tenant, "customer_plural", "Customers")}
             value={fmt(k.customers)} accent="#D35400"
             testid="kpi-customers" to={`${base}/dealers`} />
        <Kpi icon={Package} label={getLabel(tenant, "product_plural", "Products")}
             value={fmt(k.products)} accent="#2980B9"
             testid="kpi-products" to={`${base}/products`} />
        <Kpi icon={MapPin} label="Today Att." value={fmt(k.attendance_today)} accent="#27AE60"
             testid="kpi-attendance" to={`${base}/employees`} />
        <Kpi icon={TrendingUp} label="Sales (mtd)" value={fmtCur(k.sales_total)} accent="#E67E22"
             testid="kpi-sales" to={`${base}/reports`} />
        <Kpi icon={Wallet} label="Collections" value={fmtCur(k.collections_total)} accent="#16A085"
             testid="kpi-collections" to={`${base}/reports`} />
        <Kpi icon={AlertCircle} label="Outstanding" value={fmtCur(k.outstanding_total)} accent="#E74C3C"
             testid="kpi-outstanding" to={`${base}/dealers`} />
        <Kpi icon={ShoppingBag} label="Orders" value={fmt(k.orders_total)} accent="#9B59B6"
             testid="kpi-orders" to={`${base}/orders`} />
        <Kpi icon={ShoppingBag} label="Pending Orders" value={fmt(k.orders_pending)} accent="#F39C12"
             testid="kpi-orders-pending" to={`${base}/orders`} />
        <Kpi icon={MessageSquare} label="Open Enquiries" value={fmt(k.enquiries_open)} accent="#3498DB"
             testid="kpi-enquiries" to={`${base}/enquiries`} />
        <Kpi icon={TargetIcon} label="Targets" value="View" accent="#8E44AD"
             testid="kpi-targets" to={`${base}/targets`} />
        <Kpi icon={CalendarDays} label="Leaves" value="View" accent="#1ABC9C"
             testid="kpi-leaves" to={`${base}/leaves`} />
      </div>

      <div className="card-surface p-4">
        <h2 className="font-display text-base font-semibold mb-3">Sales — Last 7 days</h2>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data?.sales_trend || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={40} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="var(--brand-primary)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card-surface p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base font-semibold">Top Employees</h2>
          <Link to={`${base}/reports`} className="text-xs text-brand-primary">All →</Link>
        </div>
        <div className="space-y-2">
          {(data?.top_employees || []).map((e, i) => (
            <div key={e.user_id} className="flex items-center gap-3 py-1">
              <div className="w-7 h-7 rounded-lg bg-brand-primary/10 text-brand-primary font-display font-bold flex items-center justify-center text-xs">{i + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{e.name}</div>
              </div>
              <div className="font-mono text-sm font-semibold">{fmtCur(e.total)}</div>
            </div>
          ))}
          {(!data?.top_employees || data.top_employees.length === 0) && (
            <div className="text-sm text-brand-mute">{t("no_data")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
