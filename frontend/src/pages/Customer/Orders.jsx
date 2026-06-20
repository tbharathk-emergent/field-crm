import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";

const COLOR = {
  submitted: "#F39C12", approved: "#27AE60", packed: "#2980B9",
  dispatched: "#16A085", delivered: "#1ABC9C", cancelled: "#7F8C8D", rejected: "#E74C3C",
};

export default function Orders() {
  const { t } = useApp();
  const [list, setList] = useState([]);
  useEffect(() => { api.get("/orders").then(r => setList(r.data)); }, []);
  return (
    <div className="space-y-3 pb-4">
      <h1 className="font-display text-xl font-bold">{t("orders")}</h1>
      {list.map(o => (
        <div key={o.id} className="card-surface p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-brand-mute font-mono">#{o.id.slice(0, 8)}</div>
              <div className="text-xs text-brand-mute">{new Date(o.created_at).toLocaleString("en-IN")}</div>
            </div>
            <span className="text-xs uppercase tracking-wider px-2 py-1 rounded-full font-semibold capitalize"
                  style={{ background: `${COLOR[o.status] || "#999"}1A`, color: COLOR[o.status] }}>
              {o.status}
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {o.items.map((it, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span>{it.product_name} × {it.quantity}</span>
                <span className="font-mono">₹{Math.round(it.total)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 pt-2 border-t border-brand-line flex justify-between">
            <span className="text-xs text-brand-mute">{t("total")}</span>
            <span className="font-mono font-semibold">₹{Math.round(o.total_value).toLocaleString("en-IN")}</span>
          </div>
        </div>
      ))}
      {list.length === 0 && <div className="card-surface p-8 text-center text-brand-mute text-sm">No orders yet</div>}
    </div>
  );
}
