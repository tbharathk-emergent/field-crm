import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Store, Sprout, Package, MessageSquare, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useApp, getLabel } from "@/context/AppContext";

const MODULE_META = {
  dealer:   { icon: Store,        color: "#D35400" },
  customer: { icon: Sprout,       color: "#27AE60" },
  product:  { icon: Package,      color: "#2980B9" },
  enquiry:  { icon: MessageSquare,color: "#E67E22" },
  visit:    { icon: FileText,     color: "#8E44AD" },
};

const FIELD_TYPES = [
  { value: "text",     label: "Text (single line)" },
  { value: "textarea", label: "Text (multi-line)" },
  { value: "number",   label: "Number" },
  { value: "date",     label: "Date" },
  { value: "dropdown", label: "Dropdown" },
  { value: "radio",    label: "Radio (single choice)" },
  { value: "checkbox", label: "Checkbox (multi-select)" },
];

export default function CustomFields() {
  const { tenant } = useApp();
  const [list, setList] = useState([]);
  const [activeModule, setActiveModule] = useState("dealer");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);

  const load = () => api.get("/custom-fields").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);

  const view = list.filter((f) => f.module === activeModule).sort((a, b) => (a.order || 0) - (b.order || 0));

  const moduleLabel = (m) => {
    if (m === "dealer") return getLabel(tenant, "dealer_plural", "Dealers");
    if (m === "customer") return getLabel(tenant, "customer_plural", "Customers");
    if (m === "product") return getLabel(tenant, "product_plural", "Products");
    return m.charAt(0).toUpperCase() + m.slice(1) + "s";
  };

  const blank = {
    module: activeModule, field_key: "", label: "", type: "text",
    options: [], required: false, order: 0,
    placeholder: "", help_text: "", visible_to_customer: true,
  };

  const openCreate = () => { setEditing(null); setForm({ ...blank, module: activeModule }); setOpen(true); };
  const openEdit = (f) => { setEditing(f); setForm({ ...f, options: f.options || [] }); setOpen(true); };

  const submit = async () => {
    if (!form.field_key || !form.label) return toast.error("field_key and label required");
    if (["dropdown", "radio", "checkbox"].includes(form.type) && form.options.filter(Boolean).length === 0) {
      return toast.error("Add at least one option");
    }
    const payload = {
      ...form,
      options: form.options.filter(Boolean),
      order: +form.order || 0,
    };
    try {
      if (editing) await api.patch(`/custom-fields/${editing.id}`, payload);
      else await api.post("/custom-fields", payload);
      toast.success("Saved");
      setOpen(false);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const del = async (id) => {
    if (!confirm("Disable this field? Existing data on records won't be lost.")) return;
    await api.delete(`/custom-fields/${id}`);
    toast.success("Disabled");
    load();
  };

  const setOption = (i, v) => {
    const opts = [...(form.options || [])];
    opts[i] = v;
    setForm({ ...form, options: opts });
  };
  const addOption = () => setForm({ ...form, options: [...(form.options || []), ""] });
  const removeOption = (i) => setForm({ ...form, options: form.options.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Custom Fields</h1>
        <p className="text-brand-mute text-sm mt-1">
          Add tenant-specific fields to any module. They appear in the create/edit form and are stored on the record.
        </p>
      </div>

      {/* Module tabs */}
      <div className="flex gap-2 flex-wrap">
        {Object.keys(MODULE_META).map((m) => {
          const Icon = MODULE_META[m].icon;
          const active = activeModule === m;
          return (
            <button
              key={m}
              data-testid={`cf-tab-${m}`}
              onClick={() => setActiveModule(m)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition ${
                active ? "bg-brand-primary text-white border-brand-primary" : "border-brand-line text-brand-ink bg-white"
              }`}
              style={active ? {} : { color: MODULE_META[m].color }}
            >
              <Icon size={16} /> {moduleLabel(m)}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-brand-mute">{view.length} field{view.length === 1 ? "" : "s"}</div>
        <button data-testid="cf-add-btn" onClick={openCreate} className="btn-primary">
          <Plus size={16} /> Add Field
        </button>
      </div>

      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg text-brand-mute text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">Label</th>
              <th className="text-left px-4 py-3">Key</th>
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Required</th>
              <th className="text-left px-4 py-3">Order</th>
              <th className="text-left px-4 py-3">Customer-visible</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-line">
            {view.map((f) => (
              <tr key={f.id} className="hover:bg-brand-bg/50">
                <td className="px-4 py-3 font-medium">{f.label}</td>
                <td className="px-4 py-3 font-mono text-xs">{f.field_key}</td>
                <td className="px-4 py-3 capitalize">{f.type}{f.options?.length ? ` (${f.options.length})` : ""}</td>
                <td className="px-4 py-3">{f.required ? "Yes" : "No"}</td>
                <td className="px-4 py-3">{f.order || 0}</td>
                <td className="px-4 py-3">{f.visible_to_customer === false ? "No" : "Yes"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => openEdit(f)} className="text-brand-mute hover:text-brand-primary p-1"><Pencil size={14} /></button>
                  <button onClick={() => del(f.id)} className="text-brand-mute hover:text-brand-error p-1 ml-1"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan="7" className="text-center py-8 text-brand-mute">No custom fields yet. Click "Add Field" to create one.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Custom Field</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Module</Label>
                  <Select value={form.module} onValueChange={(v) => setForm({ ...form, module: v })} disabled={!!editing}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.keys(MODULE_META).map(m => (
                        <SelectItem key={m} value={m}>{moduleLabel(m)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Field Type</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger data-testid="cf-type-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Label (shown to user) *</Label>
                <Input data-testid="cf-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. License Type" />
              </div>
              <div>
                <Label>Field Key (unique id, snake_case) *</Label>
                <Input data-testid="cf-key" value={form.field_key} disabled={!!editing}
                       onChange={(e) => setForm({ ...form, field_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                       placeholder="e.g. license_type" />
              </div>

              {["dropdown", "radio", "checkbox"].includes(form.type) && (
                <div>
                  <Label>Options</Label>
                  <div className="space-y-2 mt-1">
                    {(form.options || []).map((o, i) => (
                      <div key={i} className="flex gap-2">
                        <Input value={o} onChange={(e) => setOption(i, e.target.value)} placeholder={`Option ${i + 1}`} />
                        <button onClick={() => removeOption(i)} className="px-2 rounded-lg border border-brand-line text-brand-error"><Trash2 size={14} /></button>
                      </div>
                    ))}
                    <button onClick={addOption} className="text-xs text-brand-primary font-medium">+ Add option</button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div><Label>Placeholder</Label><Input value={form.placeholder || ""} onChange={(e) => setForm({ ...form, placeholder: e.target.value })} /></div>
                <div><Label>Order</Label><Input type="number" value={form.order || 0} onChange={(e) => setForm({ ...form, order: +e.target.value })} /></div>
              </div>
              <div>
                <Label>Help Text</Label>
                <Input value={form.help_text || ""} onChange={(e) => setForm({ ...form, help_text: e.target.value })} />
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <label className="inline-flex items-center gap-2 text-sm">
                  <Checkbox checked={form.required} onCheckedChange={(c) => setForm({ ...form, required: !!c })} />
                  <span>Required</span>
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <Checkbox checked={form.visible_to_customer !== false} onCheckedChange={(c) => setForm({ ...form, visible_to_customer: !!c })} />
                  <span>Visible on Customer / Dealer self-signup PWA</span>
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-brand-line">Cancel</button>
            <button data-testid="cf-save-btn" onClick={submit} className="btn-primary">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
