import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function Plans() {
  const [plans, setPlans] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = () => api.get("/super/plans").then((r) => setPlans(r.data));
  useEffect(() => { load(); }, []);

  const blank = {
    name: "", code: "monthly", price_monthly: 0, price_yearly: 0,
    max_employees: 10, max_managers: 2, max_dealers: 100, max_products: 100,
    storage_mb: 500, gps_tracking: true, reports_enabled: true,
    push_notifications: true, customer_app_enabled: true, is_active: true,
  };

  const openCreate = () => { setEditing(null); setForm(blank); setOpen(true); };
  const openEdit = (p) => { setEditing(p); setForm({ ...p }); setOpen(true); };

  const submit = async () => {
    try {
      if (editing) await api.patch(`/super/plans/${editing.id}`, form);
      else await api.post("/super/plans", form);
      toast.success("Saved");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Plans</h1>
        <button onClick={openCreate} data-testid="add-plan-btn" className="btn-primary">
          <Plus size={16} /> New Plan
        </button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {plans.map((p) => (
          <div key={p.id} className="card-surface p-5">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-display font-semibold text-lg">{p.name}</div>
                <div className="text-xs text-brand-mute uppercase tracking-wider">{p.code}</div>
              </div>
              <button onClick={() => openEdit(p)} className="text-brand-mute hover:text-brand-primary">
                <Pencil size={16} />
              </button>
            </div>
            <div className="text-2xl font-display font-bold text-brand-primary my-2">
              ₹{p.price_monthly || p.price_yearly || 0}
              <span className="text-xs text-brand-mute ml-1">{p.price_yearly ? "/yr" : "/mo"}</span>
            </div>
            <ul className="text-sm text-brand-mute space-y-1">
              <li>{p.max_employees} employees</li>
              <li>{p.max_dealers} dealers</li>
              <li>{p.max_products} products</li>
              <li>{p.storage_mb} MB storage</li>
              <li>{p.gps_tracking ? "✓" : "✗"} GPS tracking</li>
              <li>{p.customer_app_enabled ? "✓" : "✗"} Customer App</li>
            </ul>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Plan" : "New Plan"}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3 py-3">
            <div><Label>Name</Label><Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Code</Label><Input value={form.code || ""} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><Label>Price/Month (₹)</Label><Input type="number" value={form.price_monthly || 0} onChange={(e) => setForm({ ...form, price_monthly: +e.target.value })} /></div>
            <div><Label>Price/Year (₹)</Label><Input type="number" value={form.price_yearly || 0} onChange={(e) => setForm({ ...form, price_yearly: +e.target.value })} /></div>
            <div><Label>Max Employees</Label><Input type="number" value={form.max_employees || 0} onChange={(e) => setForm({ ...form, max_employees: +e.target.value })} /></div>
            <div><Label>Max Managers</Label><Input type="number" value={form.max_managers || 0} onChange={(e) => setForm({ ...form, max_managers: +e.target.value })} /></div>
            <div><Label>Max Dealers</Label><Input type="number" value={form.max_dealers || 0} onChange={(e) => setForm({ ...form, max_dealers: +e.target.value })} /></div>
            <div><Label>Max Products</Label><Input type="number" value={form.max_products || 0} onChange={(e) => setForm({ ...form, max_products: +e.target.value })} /></div>
            <div><Label>Storage (MB)</Label><Input type="number" value={form.storage_mb || 0} onChange={(e) => setForm({ ...form, storage_mb: +e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={!!form.gps_tracking} onCheckedChange={(v) => setForm({ ...form, gps_tracking: v })} /><Label>GPS Tracking</Label></div>
            <div className="flex items-center gap-2"><Switch checked={!!form.reports_enabled} onCheckedChange={(v) => setForm({ ...form, reports_enabled: v })} /><Label>Reports</Label></div>
            <div className="flex items-center gap-2"><Switch checked={!!form.push_notifications} onCheckedChange={(v) => setForm({ ...form, push_notifications: v })} /><Label>Notifications</Label></div>
            <div className="flex items-center gap-2"><Switch checked={!!form.customer_app_enabled} onCheckedChange={(v) => setForm({ ...form, customer_app_enabled: v })} /><Label>Customer App</Label></div>
            <div className="flex items-center gap-2"><Switch checked={!!form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
          </div>
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-brand-line">Cancel</button>
            <button onClick={submit} className="btn-primary">{editing ? "Save" : "Create"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
