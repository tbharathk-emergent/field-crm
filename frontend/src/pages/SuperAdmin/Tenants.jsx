import React, { useEffect, useState } from "react";
import { Plus, ExternalLink, Pencil } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const BUSINESSES = ["Agriculture", "FMCG", "Pharma", "Manufacturing", "Service", "Other"];
const LANGS = ["en", "hi", "te", "ta", "kn", "mr"];

export default function Tenants() {
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = async () => {
    const [t, p] = await Promise.all([
      api.get("/super/tenants"),
      api.get("/super/plans"),
    ]);
    setTenants(t.data);
    setPlans(p.data);
  };

  useEffect(() => { load(); }, []);

  const blankForm = {
    slug: "", name: "", business_type: "Agriculture",
    contact_email: "", contact_phone: "", address: "",
    plan_id: "", primary: "#2C5E43", secondary: "#D35400",
    customer_label: "Customer", dealer_label: "Dealer",
    default_language: "en", admin_phone: "", admin_name: "",
  };

  const openCreate = () => { setEditing(null); setForm(blankForm); setOpen(true); };
  const openEdit = (tn) => {
    setEditing(tn);
    setForm({
      name: tn.name, business_type: tn.business_type, contact_email: tn.contact_email,
      contact_phone: tn.contact_phone, address: tn.address, plan_id: tn.plan_id,
      plan_status: tn.plan_status, is_active: tn.is_active,
      google_maps_api_key: tn.google_maps_api_key || "",
      order_approval_flow: tn.order_approval_flow || "direct",
    });
    setOpen(true);
  };

  const submit = async () => {
    try {
      if (editing) {
        await api.patch(`/super/tenants/${editing.id}`, form);
        toast.success("Tenant updated");
      } else {
        await api.post("/super/tenants", form);
        toast.success("Tenant created");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Tenants</h1>
          <p className="text-brand-mute text-sm mt-1">{tenants.length} total</p>
        </div>
        <button data-testid="add-tenant-btn" onClick={openCreate} className="btn-primary">
          <Plus size={16} /> New Tenant
        </button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tenants.map((tn) => (
          <div key={tn.id} data-testid={`tenant-card-${tn.slug}`} className="card-surface p-5 hover:shadow-md transition">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-display font-bold flex-shrink-0"
                style={{ background: tn.theme?.primary || "#2C5E43" }}>
                {tn.name?.[0] || "T"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display font-semibold truncate">{tn.name}</div>
                <div className="text-xs text-brand-mute">/t/{tn.slug}</div>
                <div className="flex gap-1 flex-wrap mt-1">
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary font-semibold">
                    {tn.business_type}
                  </span>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${
                    tn.is_active ? "bg-brand-success/10 text-brand-success" : "bg-brand-error/10 text-brand-error"
                  }`}>
                    {tn.is_active ? "active" : "disabled"}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div className="bg-brand-bg rounded-lg p-2">
                <div className="text-xs text-brand-mute">Staff</div>
                <div className="font-display font-bold">{tn.stats?.employees ?? 0}</div>
              </div>
              <div className="bg-brand-bg rounded-lg p-2">
                <div className="text-xs text-brand-mute">Customers</div>
                <div className="font-display font-bold">{tn.stats?.customers ?? 0}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button data-testid={`edit-tenant-${tn.slug}`} onClick={() => openEdit(tn)} className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-brand-line text-sm hover:bg-brand-bg">
                <Pencil size={14} /> Edit
              </button>
              <a href={`/t/${tn.slug}`} target="_blank" rel="noreferrer"
                 className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-brand-primary/10 text-brand-primary text-sm font-medium hover:bg-brand-primary/20">
                <ExternalLink size={14} /> Visit
              </a>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Tenant" : "Create New Tenant"}</DialogTitle>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4 py-3">
            {!editing && (
              <div>
                <Label>Slug *</Label>
                <Input data-testid="tenant-slug" value={form.slug || ""} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="akshara" />
              </div>
            )}
            <div>
              <Label>Name *</Label>
              <Input data-testid="tenant-name" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Akshara Agro" />
            </div>
            <div>
              <Label>Business Type</Label>
              <Select value={form.business_type} onValueChange={(v) => setForm({ ...form, business_type: v })}>
                <SelectTrigger data-testid="tenant-business"><SelectValue /></SelectTrigger>
                <SelectContent>{BUSINESSES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Plan</Label>
              <Select value={form.plan_id || ""} onValueChange={(v) => setForm({ ...form, plan_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>{plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Contact Email</Label>
              <Input value={form.contact_email || ""} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
            </div>
            <div>
              <Label>Contact Phone</Label>
              <Input value={form.contact_phone || ""} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Address</Label>
              <Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <Label>Primary Color</Label>
              <Input type="color" value={form.primary || "#2C5E43"} onChange={(e) => setForm({ ...form, primary: e.target.value })} />
            </div>
            <div>
              <Label>Secondary Color</Label>
              <Input type="color" value={form.secondary || "#D35400"} onChange={(e) => setForm({ ...form, secondary: e.target.value })} />
            </div>
            {!editing && (
              <>
                <div>
                  <Label>Customer Label (e.g. Farmer, Patient)</Label>
                  <Input data-testid="customer-label" value={form.customer_label || ""} onChange={(e) => setForm({ ...form, customer_label: e.target.value })} />
                </div>
                <div>
                  <Label>Dealer Label</Label>
                  <Input value={form.dealer_label || ""} onChange={(e) => setForm({ ...form, dealer_label: e.target.value })} />
                </div>
                <div>
                  <Label>Default Language</Label>
                  <Select value={form.default_language} onValueChange={(v) => setForm({ ...form, default_language: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LANGS.map((l) => <SelectItem key={l} value={l}>{l.toUpperCase()}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Admin Phone</Label>
                  <Input data-testid="admin-phone" value={form.admin_phone || ""} onChange={(e) => setForm({ ...form, admin_phone: e.target.value })} placeholder="9XXXXXXXXX" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Admin Name</Label>
                  <Input value={form.admin_name || ""} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} />
                </div>
              </>
            )}
            {editing && (
              <>
                <div>
                  <Label>Order Approval Flow</Label>
                  <Select value={form.order_approval_flow || "direct"} onValueChange={(v) => setForm({ ...form, order_approval_flow: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct">Direct (no approval)</SelectItem>
                      <SelectItem value="sales_exec">Sales Executive</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Tenant Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Google Maps API Key (optional)</Label>
                  <Input value={form.google_maps_api_key || ""} onChange={(e) => setForm({ ...form, google_maps_api_key: e.target.value })} placeholder="Defaults to OpenStreetMap" />
                </div>
                <div className="flex items-center gap-3 sm:col-span-2">
                  <Switch checked={!!form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                  <Label>Tenant Active</Label>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-brand-line">Cancel</button>
            <button data-testid="save-tenant-btn" onClick={submit} className="btn-primary">{editing ? "Save" : "Create"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
