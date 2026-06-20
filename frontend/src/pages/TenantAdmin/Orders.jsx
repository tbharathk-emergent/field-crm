import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/context/AppContext";

const STATUS_FLOW = ["submitted", "approved", "packed", "dispatched", "delivered", "cancelled", "rejected"];
const STATUS_COLOR = {
  submitted: "#F39C12", approved: "#27AE60", packed: "#2980B9",
  dispatched: "#16A085", delivered: "#1ABC9C", cancelled: "#7F8C8D", rejected: "#E74C3C",
};

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Orders</h1>
          <p className="text-brand-mute text-sm mt-1">{list.length} total</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_FLOW.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {view.map((o) => (
          <div key={o.id} className="card-surface p-4">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <div className="text-xs text-brand-mute font-mono">#{o.id.slice(0, 8)} · {new Date(o.created_at).toLocaleString("en-IN")}</div>
                <div className="font-display font-semibold text-lg">{o.customer_name}</div>
                <div className="text-xs text-brand-mute">{o.dealer_code} · {o.items.length} items · ₹{Math.round(o.total_value).toLocaleString("en-IN")}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider px-3 py-1.5 rounded-full font-semibold capitalize"
                      style={{ background: `${STATUS_COLOR[o.status] || "#999"}1A`, color: STATUS_COLOR[o.status] || "#999" }}>
                  {o.status}
                </span>
                <Select value={o.status} onValueChange={(v) => setStatus(o.id, v)}>
                  <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUS_FLOW.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {o.items.map((it, i) => (
                <div key={i} className="bg-brand-bg rounded-lg px-3 py-2 text-xs flex justify-between">
                  <span>{it.product_name} × {it.quantity}</span>
                  <span className="font-mono">₹{Math.round(it.total)}</span>
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
