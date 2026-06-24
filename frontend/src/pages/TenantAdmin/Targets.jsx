import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Target as TargetIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function monthLabel(m) {
  const [y, mm] = m.split("-").map(Number);
  return new Date(y, mm - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
}

export default function Targets() {
  const today = new Date();
  const cur = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(cur);
  const [progress, setProgress] = useState({ rows: [] });
  const [drafts, setDrafts] = useState({});

  const load = async () => {
    const res = await api.get("/targets/progress", { params: { month } });
    setProgress(res.data);
    const d = {};
    (res.data.rows || []).forEach(r => { d[r.user_id] = r.target || 0; });
    setDrafts(d);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [month]);

  const save = async (uid) => {
    try {
      await api.post("/targets", { user_id: uid, month, sales_target: +drafts[uid] || 0 });
      toast.success("Target saved");
      load();
    } catch { toast.error("Failed"); }
  };

  const totalTarget = (progress.rows || []).reduce((s, r) => s + (r.target || 0), 0);
  const totalActual = (progress.rows || []).reduce((s, r) => s + (r.actual || 0), 0);
  const totalPct = totalTarget > 0 ? Math.round(totalActual / totalTarget * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Sales Targets</h1>
          <p className="text-brand-mute text-sm mt-1">Set monthly targets per employee. Progress rolls up across the area hierarchy.</p>
        </div>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" data-testid="target-month-input" />
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="card-surface p-5">
          <div className="label-up">Total Target</div>
          <div className="kpi-num text-brand-primary">₹{totalTarget.toLocaleString("en-IN")}</div>
        </div>
        <div className="card-surface p-5">
          <div className="label-up">Actual</div>
          <div className="kpi-num">₹{Math.round(totalActual).toLocaleString("en-IN")}</div>
        </div>
        <div className="card-surface p-5">
          <div className="label-up">Achievement</div>
          <div className="kpi-num" style={{ color: totalPct >= 100 ? "#27AE60" : totalPct >= 60 ? "#F39C12" : "#E74C3C" }}>{totalPct}%</div>
        </div>
      </div>

      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg text-brand-mute text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Employee</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-right px-4 py-3">Target (₹)</th>
              <th className="text-right px-4 py-3">Actual (₹)</th>
              <th className="text-left px-4 py-3 w-1/3">Progress</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-line">
            {(progress.rows || []).map(r => (
              <tr key={r.user_id} className="hover:bg-brand-bg/50">
                <td className="px-4 py-3 font-medium">{r.user_name}</td>
                <td className="px-4 py-3 text-brand-mute capitalize">{r.role}</td>
                <td className="px-4 py-3 text-right">
                  <Input type="number" value={drafts[r.user_id] || 0}
                         onChange={(e) => setDrafts({ ...drafts, [r.user_id]: e.target.value })}
                         className="w-32 text-right ml-auto h-9"
                         data-testid={`target-input-${r.user_id}`} />
                </td>
                <td className="px-4 py-3 text-right font-mono">₹{Math.round(r.actual).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-brand-line overflow-hidden">
                      <div className="h-full" style={{
                        width: `${Math.min(100, r.percent)}%`,
                        background: r.percent >= 100 ? "#27AE60" : r.percent >= 60 ? "#F39C12" : "#E74C3C"
                      }} />
                    </div>
                    <span className="text-xs font-mono w-12 text-right">{r.percent}%</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button data-testid={`save-target-${r.user_id}`} onClick={() => save(r.user_id)}
                          className="px-3 py-1.5 rounded-lg bg-brand-primary text-white text-xs">Save</button>
                </td>
              </tr>
            ))}
            {(progress.rows || []).length === 0 && (
              <tr><td colSpan="6" className="text-center py-8 text-brand-mute">No employees yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
