import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp, getLabel } from "@/context/AppContext";

const STATUS = ["new", "in_progress", "followup", "closed"];

export default function Enquiries() {
  const { tenant, t } = useApp();
  const [list, setList] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [filter, setFilter] = useState("all");

  const load = async () => {
    const [e, emp] = await Promise.all([
      api.get("/enquiries"),
      api.get("/tenant/users", { params: { role: "employee" } }),
    ]);
    setList(e.data); setEmployees(emp.data);
  };
  useEffect(() => { load(); }, []);

  const view = filter === "all" ? list : list.filter((e) => e.status === filter);

  const upd = async (id, patch) => {
    try {
      await api.patch(`/enquiries/${id}`, patch);
      toast.success("Updated");
      load();
    } catch { toast.error("Failed"); }
  };

  const label = getLabel(tenant, "customer", "Customer");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{label} Enquiries</h1>
          <p className="text-brand-mute text-sm mt-1">{list.length} total</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {view.map((e) => (
          <div key={e.id} className="card-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-display font-semibold">{e.customer_name}</div>
                <div className="text-xs text-brand-mute">{e.mobile} · {e.village}, {e.district}</div>
              </div>
              <span className={`text-xs uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold capitalize ${
                e.status === "new" ? "bg-blue-100 text-blue-700" :
                e.status === "in_progress" ? "bg-yellow-100 text-yellow-700" :
                e.status === "followup" ? "bg-orange-100 text-orange-700" :
                "bg-emerald-100 text-emerald-700"
              }`}>{e.status.replace("_", " ")}</span>
            </div>
            {e.category && <div className="text-xs text-brand-primary font-medium mt-2">{e.category}</div>}
            {e.description && <p className="text-sm mt-2 text-brand-mute">{e.description}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Select value={e.assigned_employee_id || ""} onValueChange={(v) => upd(e.id, { assigned_employee_id: v })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Assign to..." /></SelectTrigger>
                <SelectContent>{employees.map(emp => <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={e.status} onValueChange={(v) => upd(e.id, { status: v })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{STATUS.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="text-xs text-brand-mute mt-2">{new Date(e.created_at).toLocaleString("en-IN")} · via {e.source}</div>
          </div>
        ))}
        {view.length === 0 && <div className="col-span-full card-surface p-8 text-center text-brand-mute">{t("no_data")}</div>}
      </div>
    </div>
  );
}
