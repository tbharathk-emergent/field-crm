import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export default function Roles() {
  const [list, setList] = useState([]);
  const [modules, setModules] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", description: "", permissions: {}, is_default: false });

  const load = async () => {
    const [r, m] = await Promise.all([api.get("/roles"), api.get("/permission-modules")]);
    setList(r.data); setModules(m.data.modules);
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    const perms = {};
    (modules || []).forEach(m => { perms[m] = { read: false, write: false }; });
    setEditing(null);
    setForm({ name: "", description: "", permissions: perms, is_default: false });
    setOpen(true);
  };
  const openEdit = (r) => {
    const perms = { ...(r.permissions || {}) };
    (modules || []).forEach(m => { if (!perms[m]) perms[m] = { read: false, write: false }; });
    setEditing(r);
    setForm({ name: r.name, description: r.description || "", permissions: perms, is_default: r.is_default });
    setOpen(true);
  };
  const togglePerm = (mod, action) => {
    setForm(f => {
      const p = { ...f.permissions };
      p[mod] = { ...(p[mod] || {}), [action]: !p[mod]?.[action] };
      // write implies read
      if (action === "write" && p[mod].write) p[mod].read = true;
      return { ...f, permissions: p };
    });
  };
  const submit = async () => {
    try {
      if (editing) await api.patch(`/roles/${editing.id}`, form);
      else await api.post("/roles", form);
      toast.success("Saved");
      setOpen(false); load();
    } catch { toast.error("Failed"); }
  };
  const del = async (id) => {
    if (!confirm("Disable this role?")) return;
    await api.delete(`/roles/${id}`); load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Roles & Permissions</h1>
          <p className="text-brand-mute text-sm mt-1">Custom roles for employees with module-level read/write controls.</p>
        </div>
        <button data-testid="add-role-btn" onClick={openCreate} className="btn-primary"><Plus size={16} /> New Role</button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map(r => (
          <div key={r.id} className="card-surface p-5">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Shield className="text-brand-primary" size={18} />
                <div>
                  <div className="font-display font-semibold">{r.name}</div>
                  {r.is_default && <div className="text-[10px] uppercase tracking-wider text-brand-secondary font-semibold">Default</div>}
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEdit(r)} className="p-1.5 text-brand-mute hover:text-brand-primary"><Pencil size={14} /></button>
                <button onClick={() => del(r.id)} className="p-1.5 text-brand-mute hover:text-brand-error"><Trash2 size={14} /></button>
              </div>
            </div>
            {r.description && <div className="text-xs text-brand-mute mb-3">{r.description}</div>}
            <div className="flex flex-wrap gap-1">
              {Object.entries(r.permissions || {}).filter(([_, v]) => v.read || v.write).map(([k, v]) => (
                <span key={k} className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary font-semibold">
                  {k}{v.write ? " ✎" : " 👁"}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Role" : "New Role"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-3">
            <div><Label>Name *</Label><Input data-testid="role-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_default} onCheckedChange={(v) => setForm({ ...form, is_default: v })} /><Label>Default role for new employees</Label></div>

            <div>
              <Label className="mb-2 block">Permissions</Label>
              <div className="rounded-xl border border-brand-line overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-brand-bg text-xs uppercase tracking-wider text-brand-mute">
                    <tr><th className="text-left px-3 py-2">Module</th><th className="text-center px-3 py-2">Read</th><th className="text-center px-3 py-2">Write</th></tr>
                  </thead>
                  <tbody className="divide-y divide-brand-line">
                    {modules.map(m => (
                      <tr key={m}>
                        <td className="px-3 py-2 capitalize">{m}</td>
                        <td className="px-3 py-2 text-center">
                          <input data-testid={`perm-${m}-read`} type="checkbox" checked={!!form.permissions[m]?.read}
                                 onChange={() => togglePerm(m, "read")} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <input data-testid={`perm-${m}-write`} type="checkbox" checked={!!form.permissions[m]?.write}
                                 onChange={() => togglePerm(m, "write")} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-brand-line">Cancel</button>
            <button data-testid="save-role-btn" onClick={submit} className="btn-primary">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
