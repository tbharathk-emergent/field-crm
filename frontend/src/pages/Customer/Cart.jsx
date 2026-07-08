import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Trash2, Plus, Minus, ShoppingBag, MessageSquare } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useApp } from "@/context/AppContext";

const CART_KEY = "fc_cart";

export default function Cart() {
  const { tenant, user, t } = useApp();
  const navigate = useNavigate();
  const { slug } = useParams();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const enquiryOnly = tenant?.catalog_mode === "enquiry_only";

  useEffect(() => {
    setCart(JSON.parse(localStorage.getItem(CART_KEY) || "{}"));
    api.get("/tenant/products").then(r => setProducts(r.data));
  }, []);

  const update = (c) => { setCart(c); localStorage.setItem(CART_KEY, JSON.stringify(c)); };
  const setQty = (id, qty) => {
    const c = { ...cart };
    if (qty <= 0) delete c[id]; else c[id] = qty;
    update(c);
  };

  const items = Object.entries(cart).map(([id, qty]) => {
    const p = products.find(x => x.id === id);
    return { id, qty, product: p };
  }).filter(i => i.product);

  const total = items.reduce((s, i) => s + i.qty * (i.product.price || 0), 0);

  const place = async () => {
    if (items.length === 0) return toast.error("Cart empty");
    setSubmitting(true);
    try {
      if (enquiryOnly) {
        // Convert cart into a bulk enquiry
        const summary = items.map(i => `${i.product.name} × ${i.qty}${i.product.packing ? ` (${i.product.packing})` : ""}`).join("\n");
        await api.post("/enquiries", {
          customer_id: user?.id,
          customer_name: user?.name || "Customer",
          mobile: user?.phone,
          village: user?.village,
          district: user?.district,
          category: "Bulk Enquiry",
          description: `Enquiry for the following products:\n${summary}`,
          source: "customer",
        });
        toast.success("Enquiry submitted!");
        update({});
        navigate(`/t/${slug}/shop/orders`);
      } else {
        await api.post("/orders", {
          items: items.map(i => ({ product_id: i.id, quantity: i.qty })),
        });
        toast.success("Order placed!");
        update({});
        navigate(`/t/${slug}/shop/orders`);
      }
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-3 pb-4">
      <h1 className="font-display text-xl font-bold">{t("cart")}</h1>
      {items.length === 0 ? (
        <div className="card-surface p-8 text-center">
          <ShoppingBag className="mx-auto text-brand-mute mb-2" size={36} />
          <div className="text-brand-mute text-sm">Your cart is empty</div>
        </div>
      ) : (
        <>
          {items.map(({ id, qty, product }) => (
            <div key={id} className="card-surface p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{product.name}</div>
                  <div className="text-xs text-brand-mute">
                    {enquiryOnly ? `${qty} unit${qty === 1 ? "" : "s"}` : `₹${product.price} × ${qty}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setQty(id, qty - 1)} className="w-7 h-7 rounded-lg border border-brand-line flex items-center justify-center"><Minus size={12} /></button>
                  <span className="font-mono text-sm w-6 text-center">{qty}</span>
                  <button onClick={() => setQty(id, qty + 1)} className="w-7 h-7 rounded-lg border border-brand-line flex items-center justify-center"><Plus size={12} /></button>
                  <button onClick={() => setQty(id, 0)} className="ml-2 text-brand-error"><Trash2 size={14} /></button>
                </div>
              </div>
              {!enquiryOnly && <div className="mt-1 text-right font-mono text-sm font-semibold">₹{Math.round(qty * product.price)}</div>}
            </div>
          ))}
          <div className="card-surface p-4 sticky bottom-20">
            {enquiryOnly ? (
              <div className="mb-3 text-xs text-brand-secondary bg-brand-secondary/10 rounded-lg px-3 py-2">
                Prices are not shown. Submit an enquiry and our team will contact you.
              </div>
            ) : (
              <div className="flex justify-between mb-3">
                <span className="text-brand-mute">{t("total")}</span>
                <span className="font-display text-2xl font-bold">₹{total.toLocaleString("en-IN")}</span>
              </div>
            )}
            <button data-testid="place-order-btn" onClick={place} disabled={submitting} className="btn-primary w-full h-12 inline-flex items-center justify-center gap-2">
              {enquiryOnly && <MessageSquare size={16} />}
              {submitting ? "..." : enquiryOnly ? "Send Enquiry" : t("place_order")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
