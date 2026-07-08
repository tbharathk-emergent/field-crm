import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Users, MapPin, TrendingUp, Wallet, CalendarDays, Target as TargetIcon, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";

const Kpi = ({ icon: Icon, label, value, to, accent, testid }) => (
  <Link to={to} data-testid={testid} className="card-surface p-4 hover:shadow-md active:scale-[0.98] transition-all block">
    <div className="flex items-center justify-between mb-2">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
           style={{ background: `${accent}1A`, color: accent }}>
        <Icon size={18} />
      </div>
      <ChevronRight size={16} className="text-brand-mute" />
    </div>
    <div className="text-[11px] uppercase tracking-wider text-brand-mute font-medium">{label}</div>
    <div className="font-display text-xl font-bold mt-0.5 tracking-tight truncate">{value}</div>
  </Link>
);

export default function ManagerDashboard() {
  const { user, t } = useApp();
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [progress, setProgress] = useState(null);
  const [pendingLeaves, setPendingLeaves] = useState(0);

  useEffect(() => {
    api.get("/analytics/tenant").then((r) => setData(r.data)).catch(() => {});
    api.get("/targets/progress").then((r) => setProgress(r.data)).catch(() => {});
    api.get("/leaves", { params: { status: "pending" } }).then((r) => setPendingLeaves(r.data.length)).catch(() => {});
  }, []);

  const k = data?.kpis || {};
  const base = `/t/${slug}/manager`;
  const fmtCur = (n) => `₹${Math.round(n || 0).toLocaleString("en-IN")}`;

  const teamTotal = (progress?.rows || []).reduce((s, r) => s + (r.target || 0), 0);
  const teamActual = (progress?.rows || []).reduce((s, r) => s + (r.actual || 0), 0);
  const teamPct = teamTotal > 0 ? Math.round(teamActual / teamTotal * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Hi, {user?.name?.split(" ")[0]}</h1>
        <p className="text-brand-mute text-xs mt-0.5">Your team snapshot</p>
      </div>

      {/* Team target progress hero */}
      {teamTotal > 0 && (
        <Link to={`${base}/targets`} className="card-surface p-4 block active:scale-[0.98] transition">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TargetIcon className="text-brand-primary" size={16} />
              <div className="label-up">Team Target · this month</div>
            </div>
            <ChevronRight size={16} className="text-brand-mute" />
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="font-display text-2xl font-bold">{fmtCur(teamActual)}</span>
            <span className="text-sm text-brand-mute">/ {fmtCur(teamTotal)}</span>
          </div>
          <div className="h-2 rounded-full bg-brand-line overflow-hidden">
            <div className="h-full transition-all" style={{
              width: `${Math.min(100, teamPct)}%`,
              background: teamPct >= 100 ? "#27AE60" : teamPct >= 60 ? "#F39C12" : "#E74C3C",
            }} />
          </div>
          <div className="mt-1 text-right text-xs font-mono">{teamPct}% achieved</div>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Kpi icon={Users} label="Team" value={k.employees ?? "—"} accent="#2C5E43"
             testid="kpi-team" to={`${base}/team`} />
        <Kpi icon={MapPin} label="Checked-in" value={k.attendance_today ?? "—"} accent="#27AE60"
             testid="kpi-gps" to={`${base}/map`} />
        <Kpi icon={TrendingUp} label="Team Sales" value={fmtCur(k.sales_total)} accent="#E67E22"
             testid="kpi-sales" to={`${base}/reports`} />
        <Kpi icon={Wallet} label="Collections" value={fmtCur(k.collections_total)} accent="#16A085"
             testid="kpi-collections" to={`${base}/reports`} />
        <Kpi icon={CalendarDays} label="Pending Leaves" value={pendingLeaves} accent="#8E44AD"
             testid="kpi-leaves" to={`${base}/leaves`} />
        <Kpi icon={TargetIcon} label="Targets" value="Set" accent="#3498DB"
             testid="kpi-targets" to={`${base}/targets`} />
      </div>

      <div className="card-surface p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base font-semibold">Top Performers</h2>
          <Link to={`${base}/targets`} className="text-xs text-brand-primary">All →</Link>
        </div>
        <div className="space-y-2">
          {(data?.top_employees || []).map((e, i) => (
            <div key={e.user_id} className="flex items-center gap-3 py-1 border-b border-brand-line last:border-0">
              <div className="w-7 h-7 rounded-lg bg-brand-primary/10 text-brand-primary font-display font-bold flex items-center justify-center text-xs">{i + 1}</div>
              <div className="flex-1 truncate text-sm">{e.name}</div>
              <div className="font-mono text-sm">{fmtCur(e.total)}</div>
            </div>
          ))}
          {(data?.top_employees || []).length === 0 && (
            <div className="text-sm text-brand-mute">{t("no_data")}</div>
          )}
        </div>
      </div>
    </div>
  );
}
