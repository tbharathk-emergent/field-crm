import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Phone, MapPin, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useApp, getLabel } from "@/context/AppContext";
import CustomFieldsForm from "@/components/CustomFieldsForm";

export default function Dealers() {
  const { user, tenant, t, can } = useApp();
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const canWrite = can("dealers", "write");

  const load = () => {
    const params = { role: "dealer" };
    if (user?.role === "employee") params.assigned_employee_id = user.id;
    api.get("/tenant/users", { params }).then(r => setList(r.data));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const view = list.filter(u => !search || `${u.name} ${u.phone} ${u.dealer_code || ""} ${u.business_name || ""} ${u.village || ""}`.toLowerCase().includes(search.toLowerCase()));

  const blank = {
    phone: "", name: "", role: "dealer", business_name: "", dealer_code: "",
    address: "", village: "", district: "", state: "", pincode: "",
    assigned_employee_id: user?.role === "employee" ? user.id : "",
  };
  const openCreate = () => { setEditing(null); setForm(blank); setOpen(true); };
  const openEdit = (u) => { setEditing(u); setForm({ ...u }); setOpen(true); };

  const submit = async () => {
    if (!form.phone || !form.name) return toast.error("Phone & name required");
    try {
      if (editing) await api.patch(`/tenant/users/${editing.id}`, form);
      else await api.post("/tenant/users", { ...form, role: "dealer" });
      toast.success("Saved");
      setOpen(false);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const label = getLabel(tenant, "dealer_plural", "Dealers");
  const singular = getLabel(tenant, "dealer", "Dealer");

  return (
    <div className="space-y-3 pb-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">My {label}</h1>
        {canWrite && (
          <button data-testid="add-dealer-btn" onClick={openCreate}
                  className="btn-primary text-sm px-3 py-1.5">
            <Plus size={14} /> Add
          </button>
        )}
      </div>
      <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="space-y-2">
        {view.map(u => (
          <div key={u.id} className="card-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-display font-semibold truncate">{u.name}</div>
                <div className="text-xs text-brand-mute truncate">{u.business_name} · {u.dealer_code}</div>
                <div className="text-xs text-brand-mute flex items-center gap-1 mt-1"><MapPin size={12} /> {u.village || "—"}, {u.district || "—"}</div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                {canWrite && (
                  <button onClick={() => openEdit(u)} className="w-9 h-9 rounded-full border border-brand-line flex items-center justify-center text-brand-mute"><Pencil size={14} /></button>
                )}
                <a href={`tel:${u.phone}`} className="w-9 h-9 rounded-full bg-brand-primary text-white flex items-center justify-center"><Phone size={14} /></a>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-brand-mute">Outstanding</span>
              <span className="font-mono font-semibold">₹{(u.outstanding_amount || 0).toLocaleString("en-IN")}</span>
            </div>
          </div>
        ))}
        {view.length === 0 && <div className="text-center text-brand-mute py-8">{t("no_data")}</div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} {singular}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-3">
            <div><Label>Phone *</Label><Input data-testid="dealer-phone" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Name *</Label><Input data-testid="dealer-name" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Business Name</Label><Input value={form.business_name || ""} onChange={(e) => setForm({ ...form, business_name: e.target.value })} /></div>
            <div><Label>Dealer Code</Label><Input value={form.dealer_code || ""} onChange={(e) => setForm({ ...form, dealer_code: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Village</Label><Input value={form.village || ""} onChange={(e) => setForm({ ...form, village: e.target.value })} /></div>
              <div><Label>District</Label><Input value={form.district || ""} onChange={(e) => setForm({ ...form, district: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>State</Label><Input value={form.state || ""} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
              <div><Label>Pincode</Label><Input value={form.pincode || ""} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></div>
            </div>
            <div><Label>Address</Label><Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="pt-2 border-t border-brand-line">
              <div className="text-xs text-brand-mute mb-2 uppercase tracking-wider">Custom Fields</div>
              <CustomFieldsForm module="dealer" data={form.custom_data || {}}
                                onChange={(cd) => setForm({ ...form, custom_data: cd })} />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-brand-line">Cancel</button>
            <button data-testid="save-dealer-btn" onClick={submit} className="btn-primary">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
