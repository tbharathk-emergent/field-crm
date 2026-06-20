import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { ShoppingBag, Package, Wallet, MessageSquare, ChevronRight } from "lucide-react";
import { useApp, getLabel } from "@/context/AppContext";

export default function CustHome() {
  const { user, tenant, t } = useApp();
  const { slug } = useParams();
  const [orders, setOrders] = useState([]);
  useEffect(() => { api.get("/orders").then(r => setOrders(r.data)).catch(() => {}); }, []);

  const base = `/t/${slug}/shop`;
  const card = (Icon, label, value, to, color) => (
    <Link to={to} className="card-surface p-4 hover:shadow-md transition">
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}1A`, color }}>
          <Icon size={18} />
        </div>
        <ChevronRight className="text-brand-mute" size={16} />
      </div>
      <div className="mt-2 text-xs text-brand-mute">{label}</div>
      <div className="font-display font-bold text-lg">{value}</div>
    </Link>
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-brand-mute">{t("welcome")},</div>
        <h1 className="font-display text-2xl font-bold">{user?.name}</h1>
        <div className="text-xs text-brand-mute">{user?.business_name} · {user?.dealer_code}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {card(ShoppingBag, t("orders"), orders.length, `${base}/orders`, "#2C5E43")}
        {card(Wallet, t("outstanding"), `₹${(user?.outstanding_amount || 0).toLocaleString("en-IN")}`, `${base}/account`, "#E74C3C")}
        {card(Package, t("catalogue"), "Browse", `${base}/catalogue`, "#2980B9")}
        {card(MessageSquare, t("enquiries"), "Help", `${base}/account`, "#E67E22")}
      </div>

      <div className="card-surface p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-display font-semibold text-sm">Recent Orders</h2>
          <Link to={`${base}/orders`} className="text-xs text-brand-primary">View all →</Link>
        </div>
        <div className="space-y-2">
          {orders.slice(0, 4).map(o => (
            <div key={o.id} className="flex items-center justify-between py-2 border-b border-brand-line last:border-0">
              <div>
                <div className="font-medium text-sm">#{o.id.slice(0, 6)}</div>
                <div className="text-xs text-brand-mute">{o.items.length} items · {new Date(o.created_at).toLocaleDateString("en-IN")}</div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm">₹{Math.round(o.total_value)}</div>
                <div className="text-[10px] text-brand-mute capitalize">{o.status}</div>
              </div>
            </div>
          ))}
          {orders.length === 0 && <div className="text-center text-brand-mute text-sm py-4">No orders yet</div>}
        </div>
      </div>
    </div>
  );
}
