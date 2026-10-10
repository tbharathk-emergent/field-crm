import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp, getLabel } from "@/context/AppContext";
import { PageHeader, DataTable, StatusBadge } from "@/components/Layout/Page";

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

  const where = (e) => [e.mobile, [e.village, e.district].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const assign = (e, cls = "h-9 text-xs") => (
    <Select value={e.assigned_employee_id || ""} onValueChange={(v) => upd(e.id, { assigned_employee_id: v })}>
      <SelectTrigger className={cls}><SelectValue placeholder="Assign to..." /></SelectTrigger>
      <SelectContent>{employees.map(emp => <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>)}</SelectContent>
    </Select>
  );
  const status = (e, cls = "h-9 text-xs") => (
    <Select value={e.status} onValueChange={(v) => upd(e.id, { status: v })}>
      <SelectTrigger className={cls}><SelectValue /></SelectTrigger>
      <SelectContent>{STATUS.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title={`${label} Enquiries`} subtitle={`${view.length} of ${list.length} shown`}>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44" data-testid="enquiries-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
      </PageHeader>

      {/* Desktop: one table. Phones and tablets: a card per enquiry. */}
      <div className="hidden xl:block">
        <DataTable
          testid="admin-enquiries-table"
          rows={view}
          empty={t("no_data")}
          columns={[
            { key: "who", header: label, cell: (e) => (
              <div>
                <div className="font-medium">{e.customer_name}</div>
                {where(e) && <div className="text-xs text-brand-mute">{where(e)}</div>}
              </div>
            ) },
            { key: "what", header: "Enquiry", className: "max-w-md", cell: (e) => (
              <div>
                {e.category && <div className="text-xs text-brand-primary font-medium">{e.category}</div>}
                <div className="text-brand-mute line-clamp-2">{e.description || "—"}</div>
              </div>
            ) },
            { key: "when", header: "Received", cell: (e) => (
              <div className="whitespace-nowrap">
                <div>{new Date(e.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
                <div className="text-xs text-brand-mute">via {e.source}</div>
              </div>
            ) },
            { key: "state", header: t("status"), cell: (e) => <StatusBadge status={e.status} /> },
            { key: "assign", header: "Assigned to", cell: (e) => assign(e, "h-9 text-xs w-44") },
            { key: "status", header: "Update", cell: (e) => status(e, "h-9 text-xs w-36") },
          ]}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4 xl:hidden">
        {view.map((e) => (
          <div key={e.id} className="card-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-display font-semibold truncate">{e.customer_name}</div>
                {where(e) && <div className="text-xs text-brand-mute">{where(e)}</div>}
              </div>
              <StatusBadge status={e.status} />
            </div>
            {e.category && <div className="text-xs text-brand-primary font-medium mt-2">{e.category}</div>}
            {e.description && <p className="text-sm mt-2 text-brand-mute">{e.description}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2">
              {assign(e)}
              {status(e)}
            </div>
            <div className="text-xs text-brand-mute mt-2">{new Date(e.created_at).toLocaleString("en-IN")} · via {e.source}</div>
          </div>
        ))}
        {view.length === 0 && <div className="col-span-full card-surface p-8 text-center text-brand-mute">{t("no_data")}</div>}
      </div>
    </div>
  );
}
