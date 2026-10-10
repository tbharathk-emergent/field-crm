import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/context/AppContext";
import { postOrQueue } from "@/lib/offline";
import { PageHeader, Split } from "@/components/Layout/Page";

export default function DCR() {
  const { t } = useApp();
  const [list, setList] = useState([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10), area_covered: "",
    dealers_visited: 0, customers_met: 0, orders_booked: 0, collections_made: 0, remarks: "",
  });
  const load = () => api.get("/dcr").then(r => setList(r.data));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    try {
      const payload = {
        ...form,
        dealers_visited: +form.dealers_visited, customers_met: +form.customers_met,
        orders_booked: +form.orders_booked, collections_made: +form.collections_made,
      };
      const res = await postOrQueue(api, "/dcr", payload, "dcr");
      toast.success(res.offline ? "Saved offline — will sync" : "DCR submitted");
      load();
    } catch { toast.error("Failed"); }
  };

  const recent = (
    <>
      <h2 className="font-display text-base font-semibold">Recent Reports</h2>
      <div className="space-y-2">
        {list.slice(0, 10).map(d => (
          <div key={d.id} className="card-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium">{d.date}</div>
              <div className="text-xs text-brand-mute truncate">{d.area_covered}</div>
            </div>
            <div className="text-xs text-brand-mute mt-1">
              {d.dealers_visited} dealers · {d.customers_met} customers · {d.orders_booked} orders · ₹{d.collections_made}
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="card-surface p-6 text-center text-brand-mute text-sm">{t("no_data")}</div>}
      </div>
    </>
  );

  return (
    <div className="space-y-3 lg:space-y-5">
      <PageHeader title={t("dcr")} subtitle="Summarise the day's field activity" />
      <Split aside={recent}>
        <div className="card-surface p-4 lg:p-6 grid grid-cols-1 gap-3 lg:gap-4 lg:grid-cols-2">
          <div><Label>{t("date")}</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          <div><Label>Area Covered</Label><Input value={form.area_covered} onChange={(e) => setForm({ ...form, area_covered: e.target.value })} /></div>
          <div className="lg:col-span-2 grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            <div><Label>Dealers Visited</Label><Input type="number" value={form.dealers_visited} onChange={(e) => setForm({ ...form, dealers_visited: e.target.value })} /></div>
            <div><Label>Customers Met</Label><Input type="number" value={form.customers_met} onChange={(e) => setForm({ ...form, customers_met: e.target.value })} /></div>
            <div><Label>Orders Booked</Label><Input type="number" value={form.orders_booked} onChange={(e) => setForm({ ...form, orders_booked: e.target.value })} /></div>
            <div><Label>Collections (₹)</Label><Input type="number" value={form.collections_made} onChange={(e) => setForm({ ...form, collections_made: e.target.value })} /></div>
          </div>
          <div className="lg:col-span-2"><Label>{t("remarks")}</Label><Textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} rows={3} /></div>
          <div className="lg:col-span-2 lg:flex lg:justify-end">
            <button data-testid="dcr-submit" onClick={submit} className="btn-primary w-full lg:w-auto lg:min-w-[200px]">Submit DCR</button>
          </div>
        </div>
      </Split>
    </div>
  );
}
