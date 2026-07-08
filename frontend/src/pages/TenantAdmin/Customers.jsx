import React, { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp, getLabel } from "@/context/AppContext";
import CustomFieldsForm from "@/components/CustomFieldsForm";

export default function Customers() {
  const { tenant, t } = useApp();
  const [list, setList] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [search, setSearch] = useState("");
  const fileRef = useRef(null);

  const load = async () => {
    const [c, e] = await Promise.all([
      api.get("/tenant/users", { params: { role: "customer" } }),
      api.get("/tenant/users", { params: { role: "employee" } }),
    ]);
    setList(c.data);
    setEmployees(e.data);
  };
  useEffect(() => { load(); }, []);

  const view = list.filter((u) => !search || `${u.name} ${u.phone} ${u.village || ""} ${u.crops || ""}`.toLowerCase().includes(search.toLowerCase()));

  const blank = {
    phone: "", name: "", role: "customer",
    address: "", village: "", district: "", state: "", pincode: "",
    farm_size_acres: 0, crops: "",
    assigned_employee_id: "",
  };
  const openCreate = () => { setEditing(null); setForm(blank); setOpen(true); };
  const openEdit = (u) => { setEditing(u); setForm({ ...u }); setOpen(true); };

  const submit = async () => {
    try {
      const payload = { ...form, role: "customer" };
      if (editing) await api.patch(`/tenant/users/${editing.id}`, payload);
      else await api.post("/tenant/users", payload);
      toast.success("Saved");
      setOpen(false);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const del = async (id) => {
    if (!confirm("Disable?")) return;
    await api.delete(`/tenant/users/${id}`);
    load();
  };

  const exportXlsx = () => {
    const token = localStorage.getItem("fc_token");
    window.open(`${api.defaults.baseURL}/export/users?fmt=xlsx&auth=${token}`, "_blank");
  };

  const importFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    try {
      const res = await api.post("/import/users", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Imported ${res.data.inserted} / ${res.data.total}`);
      load();
    } catch { toast.error("Import failed"); }
  };

  const label = getLabel(tenant, "customer_plural", "Customers");
  const singular = getLabel(tenant, "customer", "Customer");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{label}</h1>
          <p className="text-brand-mute text-sm mt-1">{list.length} end-users (B2C)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportXlsx} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-line hover:bg-brand-bg text-sm"><Download size={14} /> Export</button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx" hidden onChange={importFile} />
          <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-line hover:bg-brand-bg text-sm"><Upload size={14} /> Import</button>
          <button data-testid="add-customer-btn" onClick={openCreate} className="btn-primary"><Plus size={16} /> Add</button>
        </div>
      </div>

      <div className="card-surface p-4">
        <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
      </div>

      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg text-brand-mute text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Phone</th>
              <th className="text-left px-4 py-3">Village / District</th>
              <th className="text-right px-4 py-3">Farm (ac)</th>
              <th className="text-left px-4 py-3">Crops</th>
              <th className="text-left px-4 py-3">Assigned</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-line">
            {view.map((u) => (
              <tr key={u.id} className="hover:bg-brand-bg/50">
                <td className="px-4 py-3"><div className="font-medium">{u.name}</div></td>
                <td className="px-4 py-3 font-mono text-xs">{u.phone}</td>
                <td className="px-4 py-3 text-brand-mute">{u.village || "—"}, {u.district || "—"}</td>
                <td className="px-4 py-3 text-right font-mono">{u.farm_size_acres || "—"}</td>
                <td className="px-4 py-3 text-brand-mute text-xs">{u.crops || "—"}</td>
                <td className="px-4 py-3 text-brand-mute">{employees.find(e => e.id === u.assigned_employee_id)?.name || "—"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => openEdit(u)} className="text-brand-mute hover:text-brand-primary p-1"><Pencil size={14} /></button>
                  <button onClick={() => del(u.id)} className="text-brand-mute hover:text-brand-error p-1 ml-1"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan="7" className="text-center py-8 text-brand-mute">{t("no_data")}</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} {singular}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3 py-3">
            <div><Label>Phone *</Label><Input data-testid="cust-phone" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Name *</Label><Input data-testid="cust-name" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Address</Label><Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>Village</Label><Input value={form.village || ""} onChange={(e) => setForm({ ...form, village: e.target.value })} /></div>
            <div><Label>District</Label><Input value={form.district || ""} onChange={(e) => setForm({ ...form, district: e.target.value })} /></div>
            <div><Label>State</Label><Input value={form.state || ""} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
            <div><Label>Pincode</Label><Input value={form.pincode || ""} onChange={(e) => setForm({ ...form, pincode: e.target.value })} /></div>
            <div><Label>Farm Size (acres)</Label><Input type="number" step="0.1" value={form.farm_size_acres || 0} onChange={(e) => setForm({ ...form, farm_size_acres: +e.target.value })} /></div>
            <div><Label>Crops</Label><Input value={form.crops || ""} onChange={(e) => setForm({ ...form, crops: e.target.value })} placeholder="Cotton, Paddy" /></div>
            <div>
              <Label>Assigned Employee</Label>
              <Select value={form.assigned_employee_id || ""} onValueChange={(v) => setForm({ ...form, assigned_employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="pt-2 border-t border-brand-line">
            <div className="text-xs text-brand-mute mb-2 uppercase tracking-wider">Custom Fields</div>
            <CustomFieldsForm module="customer" data={form.custom_data || {}}
                              onChange={(cd) => setForm({ ...form, custom_data: cd })} />
          </div>
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-brand-line">Cancel</button>
            <button data-testid="save-customer-btn" onClick={submit} className="btn-primary">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
