import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp, getLabel } from "@/context/AppContext";
import { postOrQueue } from "@/lib/offline";
import { PageHeader, Split } from "@/components/Layout/Page";

export default function Sales() {
  const { user, tenant, t } = useApp();
  const [dealers, setDealers] = useState([]);
  const [products, setProducts] = useState([]);
  const [list, setList] = useState([]);
  const [form, setForm] = useState({
    dealer_id: "", dealer_name: "", product_id: "", product_name: "",
    quantity: 1, unit_price: 0, sale_date: new Date().toISOString().slice(0, 10), remarks: "",
  });

  const load = async () => {
    const params = { role: "dealer" };
    if (user?.role === "employee") params.assigned_employee_id = user.id;
    const [d, p, s] = await Promise.all([
      api.get("/tenant/users", { params }),
      api.get("/tenant/products"),
      api.get("/sales"),
    ]);
    setDealers(d.data); setProducts(p.data); setList(s.data);
  };
  useEffect(() => { load(); }, [user]);

  const onDealer = (id) => {
    const d = dealers.find(x => x.id === id);
    setForm(f => ({ ...f, dealer_id: id, dealer_name: d?.name || "" }));
  };
  const onProduct = (id) => {
    const p = products.find(x => x.id === id);
    setForm(f => ({ ...f, product_id: id, product_name: p?.name || "", unit_price: p?.price || 0 }));
  };

  const submit = async () => {
    if (!form.dealer_id || !form.product_id) return toast.error("Select dealer & product");
    try {
      const payload = { ...form, quantity: +form.quantity, unit_price: +form.unit_price,
                        value: +form.quantity * +form.unit_price };
      const res = await postOrQueue(api, "/sales", payload, "sales");
      toast.success(res.offline ? "Saved offline — will sync" : "Sale recorded");
      load();
    } catch { toast.error("Failed"); }
  };

  const recent = (
    <>
      <h2 className="font-display text-base font-semibold">Recent Sales</h2>
      <div className="space-y-2">
        {list.slice(0, 10).map(s => (
          <div key={s.id} className="card-surface p-3 flex justify-between items-center gap-3">
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{s.product_name}</div>
              <div className="text-xs text-brand-mute truncate">{s.dealer_name} · {s.sale_date}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono text-sm font-semibold">₹{Math.round(s.value)}</div>
              <div className="text-[10px] text-brand-mute">{s.quantity} × {s.unit_price}</div>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="card-surface p-6 text-center text-brand-mute text-sm">{t("no_data")}</div>}
      </div>
    </>
  );

  return (
    <div className="space-y-3 lg:space-y-5">
      <PageHeader title={t("sales_entry")} subtitle="Record a sale to a dealer" />
      <Split aside={recent}>
        <div className="card-surface p-4 lg:p-6 grid grid-cols-1 gap-3 lg:gap-4 lg:grid-cols-2">
          <div>
            <Label>{getLabel(tenant, "dealer", "Dealer")}</Label>
            <Select value={form.dealer_id} onValueChange={onDealer}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{dealers.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>{getLabel(tenant, "product", "Product")}</Label>
            <Select value={form.product_id} onValueChange={onProduct}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:gap-4">
            <div><Label>{t("quantity")}</Label><Input data-testid="sales-qty" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
            <div><Label>Unit Price</Label><Input type="number" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} /></div>
          </div>
          <div><Label>{t("date")}</Label><Input type="date" value={form.sale_date} onChange={(e) => setForm({ ...form, sale_date: e.target.value })} /></div>
          <div className="lg:col-span-2 bg-brand-bg rounded-lg p-3 flex justify-between font-mono">
            <span className="text-brand-mute">Value</span>
            <span className="font-semibold">₹{(+form.quantity * +form.unit_price || 0).toLocaleString("en-IN")}</span>
          </div>
          <div className="lg:col-span-2 lg:flex lg:justify-end">
            <button data-testid="sales-submit" onClick={submit} className="btn-primary w-full lg:w-auto lg:min-w-[200px]">Submit</button>
          </div>
        </div>
      </Split>
    </div>
  );
}
