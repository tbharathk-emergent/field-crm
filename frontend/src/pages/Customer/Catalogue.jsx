import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Minus, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useApp, getLabel } from "@/context/AppContext";

const CART_KEY = "fc_cart";
const readCart = () => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch { return {}; } };
const writeCart = (c) => localStorage.setItem(CART_KEY, JSON.stringify(c));

export default function Catalogue() {
  const { tenant, user, t } = useApp();
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState(readCart);
  const [enquiring, setEnquiring] = useState(null);

  const enquiryOnly = tenant?.catalog_mode === "enquiry_only";

  useEffect(() => { api.get("/tenant/products").then(r => setList(r.data)); }, []);

  const setQty = (id, qty) => {
    const c = { ...cart };
    if (qty <= 0) delete c[id];
    else c[id] = qty;
    setCart(c); writeCart(c);
  };

  const enquire = async (p) => {
    setEnquiring(p.id);
    try {
      await api.post("/enquiries", {
        customer_id: user?.id,
        customer_name: user?.name || "Customer",
        mobile: user?.phone,
        village: user?.village,
        district: user?.district,
        category: p.category || "Product Enquiry",
        description: `Interested in: ${p.name}${p.packing ? ` (${p.packing})` : ""}`,
        source: "customer",
      });
      toast.success("Enquiry submitted — our team will get back to you.");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setEnquiring(null); }
  };

  const view = list.filter(p => !search || `${p.name} ${p.code || ""} ${p.category || ""}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-3 pb-4">
      <div>
        <h1 className="font-display text-xl font-bold">{getLabel(tenant, "product_plural", "Products")}</h1>
        {enquiryOnly && (
          <div className="mt-1 text-xs text-brand-secondary bg-brand-secondary/10 rounded-lg px-3 py-1.5 inline-block">
            Enquiry only · contact us for prices
          </div>
        )}
      </div>
      <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        {view.map(p => (
          <div key={p.id} className="card-surface p-3">
            <div className="aspect-square bg-brand-bg rounded-lg mb-2 flex items-center justify-center text-2xl font-display font-bold text-brand-primary/40">{p.name?.[0]}</div>
            <div className="font-medium text-sm truncate">{p.name}</div>
            <div className="text-xs text-brand-mute truncate">{p.packing}</div>
            {!enquiryOnly && <div className="font-mono font-semibold text-brand-primary mt-1">₹{p.price}</div>}

            {enquiryOnly ? (
              <button data-testid={`enquire-${p.id}`}
                      disabled={enquiring === p.id}
                      onClick={() => enquire(p)}
                      className="w-full mt-2 py-1.5 rounded-lg border border-brand-secondary text-brand-secondary text-xs font-medium inline-flex items-center justify-center gap-1">
                <MessageSquare size={12} /> {enquiring === p.id ? "..." : "Enquire"}
              </button>
            ) : cart[p.id] ? (
              <div className="flex items-center justify-between mt-2 bg-brand-primary text-white rounded-lg px-2 py-1">
                <button onClick={() => setQty(p.id, (cart[p.id] || 0) - 1)} className="w-7 h-7 flex items-center justify-center"><Minus size={14} /></button>
                <span className="font-mono text-sm">{cart[p.id]}</span>
                <button onClick={() => setQty(p.id, (cart[p.id] || 0) + 1)} className="w-7 h-7 flex items-center justify-center"><Plus size={14} /></button>
              </div>
            ) : (
              <button data-testid={`add-cart-${p.id}`} onClick={() => setQty(p.id, 1)}
                className="w-full mt-2 py-1.5 rounded-lg border border-brand-primary text-brand-primary text-xs font-medium">
                {t("add_to_cart")}
              </button>
            )}
          </div>
        ))}
        {view.length === 0 && <div className="col-span-2 text-center text-brand-mute py-8">{t("no_data")}</div>}
      </div>
    </div>
  );
}
