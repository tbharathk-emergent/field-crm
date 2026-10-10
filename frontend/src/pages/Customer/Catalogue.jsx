import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Minus, MessageSquare, ShoppingCart, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useApp, getLabel } from "@/context/AppContext";
import { PageHeader, Split, Panel, inr } from "@/components/Layout/Page";

const CART_KEY = "fc_cart";
const readCart = () => { try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; } catch { return {}; } };
const writeCart = (c) => localStorage.setItem(CART_KEY, JSON.stringify(c));

export default function Catalogue() {
  const { tenant, user, t, refreshTenant } = useApp();
  const { slug } = useParams();
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(null);
  const [cart, setCart] = useState(readCart);
  const [enquiring, setEnquiring] = useState(null);

  const enquiryOnly = tenant?.catalog_mode === "enquiry_only";
  const cartPath = `/t/${slug}/shop/cart`;

  useEffect(() => {
    api.get("/tenant/products").then(r => setList(r.data));
    // Refetch tenant profile in case admin toggled catalog_mode
    if (refreshTenant) refreshTenant();
  }, [refreshTenant]);

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

  const categories = useMemo(
    () => [...new Set(list.map(p => p.category).filter(Boolean))].sort(),
    [list],
  );

  const view = list.filter(p =>
    (!category || p.category === category) &&
    (!search || `${p.name} ${p.code || ""} ${p.category || ""}`.toLowerCase().includes(search.toLowerCase())));

  const cartItems = Object.entries(cart)
    .map(([id, qty]) => ({ qty, product: list.find(p => p.id === id) }))
    .filter(i => i.product);
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cartItems.reduce((s, i) => s + i.qty * (i.product.price || 0), 0);

  const searchBox = (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-mute pointer-events-none" />
      <Input className="pl-9" placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
    </div>
  );

  const chip = (label, value) => (
    <button
      key={label}
      onClick={() => setCategory(value)}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition ${
        category === value ? "bg-brand-primary text-white border-brand-primary" : "bg-white border-brand-line text-brand-ink hover:bg-brand-bg"
      }`}
    >
      {label}
    </button>
  );

  const grid = (
    <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3 lg:gap-4">
      {view.map(p => (
        <div key={p.id} className="card-surface p-3 flex flex-col">
          <div className="aspect-square bg-brand-bg rounded-lg mb-2 flex items-center justify-center overflow-hidden text-2xl font-display font-bold text-brand-primary/40">
            {p.image_path ? <img src={fileUrl(p.image_path)} alt={p.name} className="w-full h-full object-cover" /> : p.name?.[0]}
          </div>
          <div className="font-medium text-sm truncate" title={p.name}>{p.name}</div>
          <div className="text-xs text-brand-mute truncate">{p.packing}</div>
          {!enquiryOnly && <div className="font-mono font-semibold text-brand-primary mt-1">₹{p.price}</div>}

          <div className="mt-auto">
            {enquiryOnly ? (
              <button data-testid={`enquire-${p.id}`}
                      disabled={enquiring === p.id}
                      onClick={() => enquire(p)}
                      className="w-full mt-2 py-1.5 rounded-lg border border-brand-secondary text-brand-secondary text-xs font-medium inline-flex items-center justify-center gap-1">
                <MessageSquare size={12} /> {enquiring === p.id ? "..." : "Enquire"}
              </button>
            ) : cart[p.id] ? (
              <div className="flex items-center justify-between mt-2 bg-brand-primary text-white rounded-lg px-2 py-1">
                <button aria-label="decrease" onClick={() => setQty(p.id, (cart[p.id] || 0) - 1)} className="w-7 h-7 flex items-center justify-center"><Minus size={14} /></button>
                <span className="font-mono text-sm">{cart[p.id]}</span>
                <button aria-label="increase" onClick={() => setQty(p.id, (cart[p.id] || 0) + 1)} className="w-7 h-7 flex items-center justify-center"><Plus size={14} /></button>
              </div>
            ) : (
              <button data-testid={`add-cart-${p.id}`} onClick={() => setQty(p.id, 1)}
                className="w-full mt-2 py-1.5 rounded-lg border border-brand-primary text-brand-primary text-xs font-medium hover:bg-brand-primary/5">
                {t("add_to_cart")}
              </button>
            )}
          </div>
        </div>
      ))}
      {view.length === 0 && <div className="col-span-full text-center text-brand-mute py-8">{t("no_data")}</div>}
    </div>
  );

  return (
    <div className="space-y-3 lg:space-y-5 pb-4">
      <PageHeader
        title={getLabel(tenant, "product_plural", "Products")}
        subtitle={list.length ? `${view.length} of ${list.length} shown` : undefined}
      >
        <div className="hidden lg:block w-72">{searchBox}</div>
        {!enquiryOnly && (
          <Link to={cartPath} className="btn-primary hidden lg:inline-flex xl:hidden" data-testid="catalogue-cart-btn">
            <ShoppingCart size={16} /> {t("cart")} ({cartCount})
          </Link>
        )}
      </PageHeader>

      {enquiryOnly && (
        <div className="text-xs text-brand-secondary bg-brand-secondary/10 rounded-lg px-3 py-1.5 inline-block">
          Enquiry only · contact us for prices
        </div>
      )}

      <div className="lg:hidden">{searchBox}</div>

      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible" data-testid="category-filter">
          {chip("All", null)}
          {categories.map(c => chip(c, c))}
        </div>
      )}

      {enquiryOnly ? grid : (
        <Split
          asideClassName="hidden xl:block xl:sticky xl:top-24"
          aside={
            <Panel title={`Your ${t("cart").toLowerCase()}`} action={<span className="text-xs text-brand-mute">{cartCount} item{cartCount === 1 ? "" : "s"}</span>}>
              {cartItems.length === 0 ? (
                <p className="text-sm text-brand-mute">Your cart is empty. Add products to place an order.</p>
              ) : (
                <>
                  <ul className="space-y-2 text-sm max-h-[40vh] overflow-y-auto">
                    {cartItems.map(({ qty, product }) => (
                      <li key={product.id} className="flex justify-between gap-3">
                        <span className="truncate">{product.name} <span className="text-brand-mute">× {qty}</span></span>
                        <span className="font-mono shrink-0">{inr(qty * (product.price || 0))}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between items-baseline border-t border-brand-line mt-3 pt-3">
                    <span className="text-brand-mute text-sm">{t("total")}</span>
                    <span className="font-display text-xl font-bold">{inr(cartTotal)}</span>
                  </div>
                </>
              )}
              <Link to={cartPath} className="btn-primary w-full mt-4" data-testid="catalogue-go-cart">
                <ShoppingCart size={16} /> Go to {t("cart").toLowerCase()}
              </Link>
            </Panel>
          }
        >
          {grid}
        </Split>
      )}
    </div>
  );
}
