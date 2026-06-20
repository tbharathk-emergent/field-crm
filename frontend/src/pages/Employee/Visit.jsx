import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp, getLabel } from "@/context/AppContext";

export default function Visit() {
  const { user, tenant, t } = useApp();
  const [dealers, setDealers] = useState([]);
  const [list, setList] = useState([]);
  const [form, setForm] = useState({
    dealer_id: "", dealer_name: "", dealer_code: "",
    visit_date: new Date().toISOString().slice(0, 10),
    notes: "", orders_discussion: "", collection_discussion: "",
    next_followup_date: "", remarks: "",
  });

  const load = async () => {
    const params = { role: "customer" };
    if (user?.role === "employee") params.assigned_employee_id = user.id;
    const [d, v] = await Promise.all([
      api.get("/tenant/users", { params }),
      api.get("/visits"),
    ]);
    setDealers(d.data); setList(v.data);
  };
  useEffect(() => { load(); }, [user]);

  const onDealer = (id) => {
    const d = dealers.find(x => x.id === id);
    if (d) setForm(f => ({ ...f, dealer_id: id, dealer_name: d.name, dealer_code: d.dealer_code }));
  };

  const submit = async () => {
    if (!form.dealer_id) return toast.error("Select dealer");
    try {
      const loc = await new Promise(r => navigator.geolocation
        ? navigator.geolocation.getCurrentPosition(p => r({ lat: p.coords.latitude, lng: p.coords.longitude }), () => r({}), { timeout: 6000 })
        : r({}));
      await api.post("/visits", { ...form, ...loc, visit_time: new Date().toISOString() });
      toast.success("Visit submitted");
      setForm({ ...form, dealer_id: "", dealer_name: "", dealer_code: "", notes: "", orders_discussion: "", collection_discussion: "" });
      load();
    } catch (e) { toast.error("Failed"); }
  };

  return (
    <div className="space-y-3">
      <h1 className="font-display text-xl font-bold">{t("visit_report")}</h1>
      <div className="card-surface p-4 space-y-3">
        <div>
          <Label>{getLabel(tenant, "dealer", "Dealer")}</Label>
          <Select value={form.dealer_id} onValueChange={onDealer}>
            <SelectTrigger data-testid="visit-dealer"><SelectValue placeholder="Select" /></SelectTrigger>
            <SelectContent>{dealers.map(d => <SelectItem key={d.id} value={d.id}>{d.name} ({d.dealer_code})</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>{t("date")}</Label><Input type="date" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} /></div>
        <div><Label>Meeting Notes</Label><Textarea data-testid="visit-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
        <div><Label>Orders Discussion</Label><Textarea value={form.orders_discussion} onChange={(e) => setForm({ ...form, orders_discussion: e.target.value })} rows={2} /></div>
        <div><Label>Next Follow-up</Label><Input type="date" value={form.next_followup_date} onChange={(e) => setForm({ ...form, next_followup_date: e.target.value })} /></div>
        <button data-testid="visit-submit" onClick={submit} className="btn-primary w-full">Submit Visit</button>
      </div>

      <h2 className="font-display text-base font-semibold mt-4">Recent Visits</h2>
      <div className="space-y-2">
        {list.slice(0, 10).map(v => (
          <div key={v.id} className="card-surface p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">{v.dealer_name}</div>
              <div className="text-xs text-brand-mute">{v.visit_date}</div>
            </div>
            {v.notes && <div className="text-xs text-brand-mute mt-1">{v.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
