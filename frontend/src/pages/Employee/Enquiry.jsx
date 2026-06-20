import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp, getLabel } from "@/context/AppContext";

export default function Enquiry() {
  const { tenant, t } = useApp();
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ customer_name: "", mobile: "", village: "", district: "", category: "", description: "" });

  const load = () => api.get("/enquiries").then(r => setList(r.data));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.customer_name) return toast.error("Name required");
    try {
      await api.post("/enquiries", form);
      toast.success("Enquiry created");
      setForm({ customer_name: "", mobile: "", village: "", district: "", category: "", description: "" });
      load();
    } catch { toast.error("Failed"); }
  };

  const label = getLabel(tenant, "customer", "Customer");

  return (
    <div className="space-y-3">
      <h1 className="font-display text-xl font-bold">{label} Enquiry</h1>
      <div className="card-surface p-4 space-y-3">
        <div><Label>{label} Name *</Label><Input data-testid="enq-name" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Mobile</Label><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></div>
          <div><Label>Village</Label><Input value={form.village} onChange={(e) => setForm({ ...form, village: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>District</Label><Input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} /></div>
          <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Crop / Issue" /></div>
        </div>
        <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></div>
        <button data-testid="enq-submit" onClick={submit} className="btn-primary w-full">Submit</button>
      </div>

      <h2 className="font-display text-base font-semibold mt-4">My Enquiries</h2>
      <div className="space-y-2">
        {list.slice(0, 10).map(e => (
          <div key={e.id} className="card-surface p-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">{e.customer_name}</div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary capitalize">{e.status.replace("_", " ")}</span>
            </div>
            <div className="text-xs text-brand-mute mt-1">{e.mobile} · {e.village}</div>
            {e.description && <div className="text-xs text-brand-mute mt-1 line-clamp-2">{e.description}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
