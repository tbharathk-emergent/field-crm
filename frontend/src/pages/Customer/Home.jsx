import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { ShoppingBag, Package, Wallet, MessageSquare, ChevronRight, Leaf, ArrowRight } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { PageHeader, Split, Panel, DataTable, StatusBadge, inr } from "@/components/Layout/Page";

export default function CustHome() {
  const { user, t, hasFeature } = useApp();
  const { slug } = useParams();
  const [orders, setOrders] = useState([]);
  useEffect(() => { api.get("/orders").then(r => setOrders(r.data)).catch(() => {}); }, []);

  const base = `/t/${slug}/shop`;
  const isDealer = user?.role === "dealer";
  const business = [user?.business_name, user?.dealer_code].filter(Boolean).join(" · ");
  const active = orders.filter(o => ["submitted", "approved", "packed", "dispatched"].includes(o.status)).length;

  const card = (Icon, label, value, to, color) => (
    <Link to={to} className="card-surface p-4 lg:p-5 hover:shadow-md transition">
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-xl flex items-center justify-center" style={{ background: `${color}1A`, color }}>
          <Icon size={18} />
        </div>
        <ChevronRight className="text-brand-mute" size={16} />
      </div>
      <div className="mt-2 lg:mt-3 text-xs lg:text-sm text-brand-mute">{label}</div>
      <div className="font-display font-bold text-lg lg:text-2xl">{value}</div>
    </Link>
  );

  const advisorCard = (
    <Link to={`${base}/advisor`} data-testid="cust-crop-advisor-card"
          className="card-surface p-4 bg-gradient-to-br from-emerald-50 to-brand-primary/5 border-brand-primary/30 flex items-center gap-3 hover:shadow-md transition">
      <div className="w-12 h-12 rounded-2xl bg-brand-primary text-white flex items-center justify-center shrink-0">
        <Leaf size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-display font-semibold text-brand-primary">Crop Health Advisor</div>
        <div className="text-xs text-brand-mute">Diseases, pests, treatments & product recommendations</div>
      </div>
      <ChevronRight className="text-brand-primary shrink-0" size={18} />
    </Link>
  );

  const viewAll = <Link to={`${base}/orders`} className="text-xs lg:text-sm text-brand-primary whitespace-nowrap">View all →</Link>;

  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader eyebrow={`${t("welcome")},`} title={user?.name} subtitle={business || undefined}>
        <Link to={`${base}/catalogue`} className="btn-primary hidden lg:inline-flex" data-testid="home-browse-btn">
          <Package size={16} /> Browse {t("catalogue").toLowerCase()} <ArrowRight size={16} />
        </Link>
      </PageHeader>

      {/* Phones and tablets keep the advisor shortcut above the tiles. */}
      {hasFeature("crop_advisor") && <div className="xl:hidden">{advisorCard}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
        {card(ShoppingBag, t("orders"), orders.length, `${base}/orders`, "#2C5E43")}
        {card(Wallet, t("outstanding"), inr(user?.outstanding_amount), `${base}/account`, "#E74C3C")}
        {card(Package, t("catalogue"), "Browse", `${base}/catalogue`, "#2980B9")}
        {card(MessageSquare, t("enquiries"), "Help", `${base}/account`, "#E67E22")}
      </div>

      <Split
        asideClassName="hidden xl:block"
        aside={
          <>
            {hasFeature("crop_advisor") && advisorCard}
            <Panel title="At a glance">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between"><dt className="text-brand-mute">Orders in progress</dt><dd className="font-semibold">{active}</dd></div>
                <div className="flex justify-between"><dt className="text-brand-mute">Total orders</dt><dd className="font-semibold">{orders.length}</dd></div>
                {isDealer && (
                  <div className="flex justify-between"><dt className="text-brand-mute">Credit limit</dt><dd className="font-mono">{inr(user?.credit_limit)}</dd></div>
                )}
                <div className="flex justify-between"><dt className="text-brand-mute">{t("outstanding")}</dt><dd className="font-mono text-brand-error">{inr(user?.outstanding_amount)}</dd></div>
              </dl>
            </Panel>
            <Panel title="Need help?">
              <p className="text-sm text-brand-mute mb-3">Ask about a product, an order or your account and our team will get back to you.</p>
              <Link to={`${base}/account`} className="btn-outline w-full"><MessageSquare size={16} /> Raise an enquiry</Link>
            </Panel>
          </>
        }
      >
        {/* Desktop: full table. Phones: compact rows. */}
        <div className="hidden lg:block">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-base">Recent Orders</h2>
            {viewAll}
          </div>
          <DataTable
            testid="recent-orders-table"
            rows={orders.slice(0, 8)}
            empty="No orders yet"
            columns={[
              { key: "id", header: "Order", cell: (o) => <span className="font-mono font-medium">#{o.id.slice(0, 8)}</span> },
              { key: "date", header: t("date"), cell: (o) => new Date(o.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) },
              { key: "items", header: "Items", cell: (o) => <span className="text-brand-mute">{o.items.map(i => `${i.product_name} × ${i.quantity}`).join(", ")}</span> },
              { key: "status", header: t("status"), cell: (o) => <StatusBadge status={o.status} /> },
              { key: "total", header: t("total"), align: "right", cell: (o) => <span className="font-mono font-semibold">{inr(o.total_value)}</span> },
            ]}
          />
        </div>

        <div className="card-surface p-4 lg:hidden">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-display font-semibold text-sm">Recent Orders</h2>
            {viewAll}
          </div>
          <div className="space-y-2">
            {orders.slice(0, 4).map(o => (
              <div key={o.id} className="flex items-center justify-between py-2 border-b border-brand-line last:border-0">
                <div>
                  <div className="font-medium text-sm">#{o.id.slice(0, 6)}</div>
                  <div className="text-xs text-brand-mute">{o.items.length} items · {new Date(o.created_at).toLocaleDateString("en-IN")}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm">{inr(o.total_value)}</div>
                  <div className="text-[10px] text-brand-mute capitalize">{o.status}</div>
                </div>
              </div>
            ))}
            {orders.length === 0 && <div className="text-center text-brand-mute text-sm py-4">No orders yet</div>}
          </div>
        </div>
      </Split>
    </div>
  );
}
