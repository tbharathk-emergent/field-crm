import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";
import { PageHeader, DataTable, StatusBadge, inr } from "@/components/Layout/Page";

export default function Orders() {
  const { t } = useApp();
  const { slug } = useParams();
  const [list, setList] = useState([]);
  useEffect(() => { api.get("/orders").then(r => setList(r.data)); }, []);

  return (
    <div className="space-y-3 lg:space-y-5 pb-4">
      <PageHeader title={t("orders")} subtitle={list.length ? `${list.length} total` : undefined}>
        <Link to={`/t/${slug}/shop/catalogue`} className="btn-primary hidden lg:inline-flex">New order</Link>
      </PageHeader>

      {/* Desktop: one table. Phones: a card per order. */}
      <div className="hidden lg:block">
        <DataTable
          testid="orders-table"
          rows={list}
          empty="No orders yet"
          columns={[
            { key: "id", header: "Order", cell: (o) => <span className="font-mono font-medium">#{o.id.slice(0, 8)}</span> },
            { key: "date", header: "Placed", cell: (o) => <span className="whitespace-nowrap">{new Date(o.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span> },
            { key: "items", header: "Items", cell: (o) => (
              <div className="space-y-0.5">
                {o.items.map((it, i) => (
                  <div key={i}>{it.product_name} <span className="text-brand-mute">× {it.quantity}</span></div>
                ))}
              </div>
            ) },
            { key: "status", header: t("status"), cell: (o) => <StatusBadge status={o.status} /> },
            { key: "total", header: t("total"), align: "right", cell: (o) => <span className="font-mono font-semibold">{inr(o.total_value)}</span> },
          ]}
        />
      </div>

      <div className="space-y-3 lg:hidden">
        {list.map(o => (
          <div key={o.id} className="card-surface p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-brand-mute font-mono">#{o.id.slice(0, 8)}</div>
                <div className="text-xs text-brand-mute">{new Date(o.created_at).toLocaleString("en-IN")}</div>
              </div>
              <StatusBadge status={o.status} />
            </div>
            <div className="mt-2 space-y-1">
              {o.items.map((it, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span>{it.product_name} × {it.quantity}</span>
                  <span className="font-mono">{inr(it.total)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 pt-2 border-t border-brand-line flex justify-between">
              <span className="text-xs text-brand-mute">{t("total")}</span>
              <span className="font-mono font-semibold">{inr(o.total_value)}</span>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="card-surface p-8 text-center text-brand-mute text-sm">No orders yet</div>}
      </div>
    </div>
  );
}
