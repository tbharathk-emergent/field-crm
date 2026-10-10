import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp, getLabel } from "@/context/AppContext";
import { postOrQueue } from "@/lib/offline";
import { PageHeader, Split } from "@/components/Layout/Page";

const MODES = ["Cash", "UPI", "Bank Transfer", "Cheque", "Other"];

export default function Collection() {
  const { user, tenant, t } = useApp();
  const [dealers, setDealers] = useState([]);
  const [list, setList] = useState([]);
  const [form, setForm] = useState({
    dealer_id: "", dealer_name: "", amount: 0,
    collection_date: new Date().toISOString().slice(0, 10),
    payment_mode: "Cash", transaction_ref: "", remarks: "",
  });

  const load = async () => {
    const params = { role: "dealer" };
    if (user?.role === "employee") params.assigned_employee_id = user.id;
    const [d, c] = await Promise.all([
      api.get("/tenant/users", { params }),
      api.get("/collections"),
    ]);
    setDealers(d.data); setList(c.data);
  };
  useEffect(() => { load(); }, [user]);

  const onDealer = (id) => {
    const d = dealers.find(x => x.id === id);
    if (d) setForm(f => ({ ...f, dealer_id: id, dealer_name: d.name }));
  };
  const selected = dealers.find(d => d.id === form.dealer_id);

  const submit = async () => {
    if (!form.dealer_id || !form.amount) return toast.error("Dealer & amount required");
    try {
      const res = await postOrQueue(api, "/collections", { ...form, amount: +form.amount }, "collection");
      toast.success(res.offline ? "Saved offline — will sync" : "Collection recorded");
      setForm({ ...form, dealer_id: "", dealer_name: "", amount: 0, transaction_ref: "", remarks: "" });
      load();
    } catch { toast.error("Failed"); }
  };

  const recent = (
    <>
      <h2 className="font-display text-base font-semibold">Recent Collections</h2>
      <div className="space-y-2">
        {list.slice(0, 10).map(c => (
          <div key={c.id} className="card-surface p-3 flex justify-between items-center gap-3">
            <div className="min-w-0">
              <div className="font-medium truncate">{c.dealer_name}</div>
              <div className="text-xs text-brand-mute">{c.payment_mode} · {c.collection_date}</div>
            </div>
            <div className="font-mono font-semibold text-brand-primary shrink-0">₹{c.amount}</div>
          </div>
        ))}
        {list.length === 0 && <div className="card-surface p-6 text-center text-brand-mute text-sm">{t("no_data")}</div>}
      </div>
    </>
  );

  return (
    <div className="space-y-3 lg:space-y-5">
      <PageHeader title={t("collection_entry")} subtitle="Record a payment received from a dealer" />
      <Split aside={recent}>
        <div className="card-surface p-4 lg:p-6 grid grid-cols-1 gap-3 lg:gap-4 lg:grid-cols-2">
          <div>
            <Label>{getLabel(tenant, "dealer", "Dealer")}</Label>
            <Select value={form.dealer_id} onValueChange={onDealer}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{dealers.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>{t("amount")}</Label><Input data-testid="coll-amount" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          {selected && (
            <div className="lg:col-span-2 bg-brand-bg rounded-lg p-3 flex justify-between text-sm">
              <span className="text-brand-mute">Outstanding</span>
              <span className="font-mono font-semibold">₹{(selected.outstanding_amount || 0).toLocaleString("en-IN")}</span>
            </div>
          )}
          <div>
            <Label>Payment Mode</Label>
            <Select value={form.payment_mode} onValueChange={(v) => setForm({ ...form, payment_mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Transaction Ref</Label><Input value={form.transaction_ref} onChange={(e) => setForm({ ...form, transaction_ref: e.target.value })} /></div>
          <div><Label>{t("date")}</Label><Input type="date" value={form.collection_date} onChange={(e) => setForm({ ...form, collection_date: e.target.value })} /></div>
          <div className="lg:col-span-2"><Label>{t("remarks")}</Label><Textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} rows={2} /></div>
          <div className="lg:col-span-2 lg:flex lg:justify-end">
            <button data-testid="coll-submit" onClick={submit} className="btn-primary w-full lg:w-auto lg:min-w-[200px]">Submit</button>
          </div>
        </div>
      </Split>
    </div>
  );
}
