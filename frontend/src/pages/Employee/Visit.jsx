import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp, getLabel } from "@/context/AppContext";
import { postOrQueue } from "@/lib/offline";
import CustomFieldsForm from "@/components/CustomFieldsForm";

export default function Visit() {
  const { user, tenant, t } = useApp();
  const [dealers, setDealers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [list, setList] = useState([]);
  const [form, setForm] = useState({
    party_type: "dealer",
    dealer_id: "", dealer_name: "", dealer_code: "",
    customer_id: "", customer_name: "",
    visit_date: new Date().toISOString().slice(0, 10),
    notes: "", orders_discussion: "", collection_discussion: "",
    next_followup_date: "", remarks: "",
    custom_data: {},
  });

  const load = async () => {
    const params = {};
    if (user?.role === "employee") params.assigned_employee_id = user.id;
    const [d, c, v] = await Promise.all([
      api.get("/tenant/users", { params: { ...params, role: "dealer" } }),
      api.get("/tenant/users", { params: { ...params, role: "customer" } }),
      api.get("/visits"),
    ]);
    setDealers(d.data); setCustomers(c.data); setList(v.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const onDealer = (id) => {
    const d = dealers.find(x => x.id === id);
    if (d) setForm(f => ({
      ...f, party_type: "dealer",
      dealer_id: id, dealer_name: d.name, dealer_code: d.dealer_code,
      customer_id: "", customer_name: "",
    }));
  };
  const onCustomer = (id) => {
    const c = customers.find(x => x.id === id);
    if (c) setForm(f => ({
      ...f, party_type: "customer",
      customer_id: id, customer_name: c.name,
      dealer_id: "", dealer_name: "", dealer_code: "",
    }));
  };

  const submit = async () => {
    if (form.party_type === "dealer" && !form.dealer_id) return toast.error("Select a dealer");
    if (form.party_type === "customer" && !form.customer_id) return toast.error("Select a customer");
    try {
      const loc = await new Promise(r => navigator.geolocation
        ? navigator.geolocation.getCurrentPosition(p => r({ lat: p.coords.latitude, lng: p.coords.longitude }), () => r({}), { timeout: 6000 })
        : r({}));
      const payload = { ...form, ...loc, visit_time: new Date().toISOString() };
      const res = await postOrQueue(api, "/visits", payload, "visit");
      toast.success(res.offline ? "Saved offline — will sync when online" : "Visit submitted");
      setForm({
        ...form,
        dealer_id: "", dealer_name: "", dealer_code: "",
        customer_id: "", customer_name: "",
        notes: "", orders_discussion: "", collection_discussion: "",
      });
      load();
    } catch (e) { toast.error("Failed"); }
  };

  const dealerLabel = getLabel(tenant, "dealer", "Dealer");
  const customerLabel = getLabel(tenant, "customer", "Customer");

  return (
    <div className="space-y-3">
      <h1 className="font-display text-xl font-bold">{t("visit_report")}</h1>
      <div className="card-surface p-4 space-y-3">
        <div>
          <Label>Visit Type</Label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              data-testid="party-type-dealer"
              type="button"
              onClick={() => setForm(f => ({ ...f, party_type: "dealer", customer_id: "", customer_name: "" }))}
              className={`py-2 rounded-lg border text-sm font-medium transition ${
                form.party_type === "dealer"
                  ? "bg-brand-primary text-white border-brand-primary"
                  : "border-brand-line text-brand-mute"
              }`}
            >
              {dealerLabel}
            </button>
            <button
              data-testid="party-type-customer"
              type="button"
              onClick={() => setForm(f => ({ ...f, party_type: "customer", dealer_id: "", dealer_name: "", dealer_code: "" }))}
              className={`py-2 rounded-lg border text-sm font-medium transition ${
                form.party_type === "customer"
                  ? "bg-brand-primary text-white border-brand-primary"
                  : "border-brand-line text-brand-mute"
              }`}
            >
              {customerLabel}
            </button>
          </div>
        </div>

        {form.party_type === "dealer" ? (
          <div>
            <Label>{dealerLabel}</Label>
            <Select value={form.dealer_id} onValueChange={onDealer}>
              <SelectTrigger data-testid="visit-dealer"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{dealers.map(d => <SelectItem key={d.id} value={d.id}>{d.name} ({d.dealer_code || d.phone})</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : (
          <div>
            <Label>{customerLabel}</Label>
            <Select value={form.customer_id} onValueChange={onCustomer}>
              <SelectTrigger data-testid="visit-customer"><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.village || c.phone})</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        <div><Label>{t("date")}</Label><Input type="date" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} /></div>
        <div><Label>Meeting Notes</Label><Textarea data-testid="visit-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
        <div><Label>Orders Discussion</Label><Textarea value={form.orders_discussion} onChange={(e) => setForm({ ...form, orders_discussion: e.target.value })} rows={2} /></div>
        <div><Label>Next Follow-up</Label><Input type="date" value={form.next_followup_date} onChange={(e) => setForm({ ...form, next_followup_date: e.target.value })} /></div>
        <div className="pt-2 border-t border-brand-line">
          <div className="text-xs text-brand-mute mb-2 uppercase tracking-wider">Custom Fields</div>
          <CustomFieldsForm module="visit" data={form.custom_data || {}}
                            onChange={(cd) => setForm({ ...form, custom_data: cd })} />
        </div>
        <button data-testid="visit-submit" onClick={submit} className="btn-primary w-full">Submit Visit</button>
      </div>

      <h2 className="font-display text-base font-semibold mt-4">Recent Visits</h2>
      <div className="space-y-2">
        {list.slice(0, 10).map(v => (
          <div key={v.id} className="card-surface p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">
                {v.party_type === "customer" ? v.customer_name : v.dealer_name}
                <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary uppercase">
                  {v.party_type === "customer" ? customerLabel : dealerLabel}
                </span>
              </div>
              <div className="text-xs text-brand-mute">{v.visit_date}</div>
            </div>
            {v.notes && <div className="text-xs text-brand-mute mt-1">{v.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
