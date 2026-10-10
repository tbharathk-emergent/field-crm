import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/context/AppContext";
import { PageHeader, DataTable, StatusBadge, inr } from "@/components/Layout/Page";

const STATUS_FLOW = ["submitted", "approved", "packed", "dispatched", "delivered", "cancelled", "rejected"];

export default function Orders() {
  const { t } = useApp();
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState("all");

  const load = () => api.get("/orders").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);

  const view = filter === "all" ? list : list.filter((o) => o.status === filter);

  const setStatus = async (id, status) => {
    try {
      await api.patch(`/orders/${id}`, { status });
      toast.success(`Marked ${status}`);
      load();
    } catch (e) { toast.error("Failed"); }
  };

  const statusSelect = (o, cls = "w-32 h-8 text-xs") => (
    <Select value={o.status} onValueChange={(v) => setStatus(o.id, v)}>
      <SelectTrigger className={cls} data-testid={`order-status-${o.id}`}><SelectValue /></SelectTrigger>
      <SelectContent>{STATUS_FLOW.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Orders" subtitle={`${view.length} of ${list.length} shown`}>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44" data-testid="orders-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_FLOW.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </PageHeader>

      {/* Wide desktop: one table. Narrower windows, tablets and phones: a card per order. */}
      <div className="hidden xl:block">
        <DataTable
          testid="admin-orders-table"
          rows={view}
          empty={t("no_data")}
          columns={[
            { key: "id", header: "Order", cell: (o) => (
              <div>
                <div className="font-mono font-medium">#{o.id.slice(0, 8)}</div>
                <div className="text-xs text-brand-mute whitespace-nowrap">{new Date(o.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
              </div>
            ) },
            { key: "customer", header: "Customer", cell: (o) => (
              <div>
                <div className="font-medium">{o.customer_name}</div>
                {o.dealer_code && <div className="text-xs text-brand-mute font-mono">{o.dealer_code}</div>}
              </div>
            ) },
            { key: "items", header: "Items", cell: (o) => (
              <div className="space-y-0.5">
                {o.items.map((it, i) => <div key={i}>{it.product_name} <span className="text-brand-mute">× {it.quantity}</span></div>)}
                {o.remarks && <div className="text-xs text-brand-mute">Note: {o.remarks}</div>}
              </div>
            ) },
            { key: "total", header: t("total"), align: "right", cell: (o) => <span className="font-mono font-semibold">{inr(o.total_value)}</span> },
            { key: "status", header: t("status"), cell: (o) => <StatusBadge status={o.status} /> },
            { key: "update", header: "Update", cell: (o) => statusSelect(o, "w-36 h-9 text-xs") },
          ]}
        />
      </div>

      <div className="space-y-3 xl:hidden">
        {view.map((o) => (
          <div key={o.id} className="card-surface p-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <div className="text-xs text-brand-mute font-mono">#{o.id.slice(0, 8)} · {new Date(o.created_at).toLocaleString("en-IN")}</div>
                <div className="font-display font-semibold text-lg">{o.customer_name}</div>
                <div className="text-xs text-brand-mute">{[o.dealer_code, `${o.items.length} items`, inr(o.total_value)].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={o.status} />
                {statusSelect(o)}
              </div>
            </div>
            <div className="mt-3 grid sm:grid-cols-2 gap-2">
              {o.items.map((it, i) => (
                <div key={i} className="bg-brand-bg rounded-lg px-3 py-2 text-xs flex justify-between">
                  <span>{it.product_name} × {it.quantity}</span>
                  <span className="font-mono">{inr(it.total)}</span>
                </div>
              ))}
            </div>
            {o.remarks && <div className="mt-2 text-xs text-brand-mute">📝 {o.remarks}</div>}
          </div>
        ))}
        {view.length === 0 && <div className="card-surface p-8 text-center text-brand-mute">{t("no_data")}</div>}
      </div>
    </div>
  );
}
