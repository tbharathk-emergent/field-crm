import React, { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp, getLabel } from "@/context/AppContext";

export default function Employees() {
  const { tenant, t } = useApp();
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [filter, setFilter] = useState("all"); // all|employee|manager
  const [search, setSearch] = useState("");
  const fileRef = useRef(null);

  const load = async () => {
    const res = await api.get("/tenant/users", { params: { role: "tenant_admin,manager,employee" } });
    setList(res.data);
  };
  useEffect(() => { load(); }, []);

  const managers = list.filter((u) => u.role === "manager");
  const view = list.filter((u) => {
    if (filter !== "all" && u.role !== filter) return false;
    if (search && !`${u.name} ${u.phone} ${u.employee_code || ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const blank = { phone: "", name: "", role: "employee", email: "", employee_code: "", manager_id: "", area: "" };
  const openCreate = () => { setEditing(null); setForm(blank); setOpen(true); };
  const openEdit = (u) => { setEditing(u); setForm({ ...u }); setOpen(true); };

  const submit = async () => {
    try {
      if (editing) await api.patch(`/tenant/users/${editing.id}`, form);
      else await api.post("/tenant/users", form);
      toast.success("Saved");
      setOpen(false);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const del = async (id) => {
    if (!confirm("Disable this user?")) return;
    await api.delete(`/tenant/users/${id}`);
    toast.success("Disabled");
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
    } catch (e) { toast.error("Import failed"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Employees & Managers</h1>
          <p className="text-brand-mute text-sm mt-1">{list.length} total</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportXlsx} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-line hover:bg-brand-bg text-sm"><Download size={14} /> Export</button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx" hidden onChange={importFile} />
          <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-line hover:bg-brand-bg text-sm"><Upload size={14} /> Import</button>
          <button data-testid="add-employee-btn" onClick={openCreate} className="btn-primary"><Plus size={16} /> Add</button>
        </div>
      </div>

      <div className="card-surface p-4 flex gap-3 flex-wrap">
        <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="tenant_admin">Admin</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="employee">Employee</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg text-brand-mute text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Phone</th>
              <th className="text-left px-4 py-3">Role</th>
              <th className="text-left px-4 py-3">Code</th>
              <th className="text-left px-4 py-3">{getLabel(tenant, "area", "Area")}</th>
              <th className="text-left px-4 py-3">Manager</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-line">
            {view.map((u) => (
              <tr key={u.id} className="hover:bg-brand-bg/50">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{u.phone}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary capitalize">{u.role.replace("_", " ")}</span>
                </td>
                <td className="px-4 py-3 text-brand-mute">{u.employee_code || "—"}</td>
                <td className="px-4 py-3 text-brand-mute">{u.area || "—"}</td>
                <td className="px-4 py-3 text-brand-mute">{managers.find(m => m.id === u.manager_id)?.name || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button data-testid={`edit-user-${u.id}`} onClick={() => openEdit(u)} className="text-brand-mute hover:text-brand-primary p-1"><Pencil size={14} /></button>
                  <button onClick={() => del(u.id)} className="text-brand-mute hover:text-brand-error p-1 ml-1"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan="7" className="text-center py-8 text-brand-mute">{t("no_data")}</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Employee</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3 py-3">
            <div><Label>Phone *</Label><Input data-testid="user-phone" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Name *</Label><Input data-testid="user-name" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <Label>Role</Label>
              <Select value={form.role || "employee"} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="user-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="tenant_admin">Tenant Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Code</Label><Input value={form.employee_code || ""} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} /></div>
            <div><Label>Area</Label><Input value={form.area || ""} onChange={(e) => setForm({ ...form, area: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            {form.role === "employee" && (
              <div className="sm:col-span-2">
                <Label>Reports to (Manager)</Label>
                <Select value={form.manager_id || ""} onValueChange={(v) => setForm({ ...form, manager_id: v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-brand-line">Cancel</button>
            <button data-testid="save-user-btn" onClick={submit} className="btn-primary">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
