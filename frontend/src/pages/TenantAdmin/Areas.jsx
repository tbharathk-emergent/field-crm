import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Globe, MapPin, ChevronRight, Building } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TYPE_ICONS = { country: Globe, state: Building, district: MapPin, area: MapPin };
const TYPE_ORDER = ["country", "state", "district", "area"];

export default function Areas() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = () => api.get("/areas").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);

  // Build tree
  const tree = React.useMemo(() => {
    const byParent = {};
    list.forEach(a => {
      const k = a.parent_id || "ROOT";
      (byParent[k] = byParent[k] || []).push(a);
    });
    Object.values(byParent).forEach(arr => arr.sort((a, b) => a.name.localeCompare(b.name)));
    return byParent;
  }, [list]);

  const openCreate = (parent) => {
    const parentType = parent?.type;
    const nextType = parentType ? TYPE_ORDER[TYPE_ORDER.indexOf(parentType) + 1] : "country";
    setEditing(null);
    setForm({ name: "", type: nextType || "area", parent_id: parent?.id || "" });
    setOpen(true);
  };
  const openEdit = (n) => { setEditing(n); setForm({ name: n.name, type: n.type, code: n.code || "", parent_id: n.parent_id || "" }); setOpen(true); };

  const submit = async () => {
    try {
      if (editing) await api.patch(`/areas/${editing.id}`, form);
      else await api.post("/areas", { ...form, parent_id: form.parent_id || null });
      toast.success("Saved");
      setOpen(false); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const del = async (id) => {
    if (!confirm("Disable this area and all its descendants?")) return;
    await api.delete(`/areas/${id}`);
    load();
  };

  const renderNode = (node, depth = 0) => {
    const Icon = TYPE_ICONS[node.type] || MapPin;
    const children = tree[node.id] || [];
    return (
      <div key={node.id}>
        <div className="flex items-center gap-2 py-2 px-3 hover:bg-brand-bg rounded-lg" style={{ paddingLeft: 12 + depth * 24 }}>
          <Icon size={16} className="text-brand-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm truncate">{node.name}</div>
            <div className="text-[10px] uppercase tracking-wider text-brand-mute">{node.type}</div>
          </div>
          {node.type !== "area" && (
            <button data-testid={`add-child-${node.id}`} onClick={() => openCreate(node)}
              className="p-1.5 text-brand-mute hover:text-brand-primary" title="Add child">
              <Plus size={14} />
            </button>
          )}
          <button onClick={() => openEdit(node)} className="p-1.5 text-brand-mute hover:text-brand-primary"><Pencil size={14} /></button>
          <button onClick={() => del(node.id)} className="p-1.5 text-brand-mute hover:text-brand-error"><Trash2 size={14} /></button>
        </div>
        {children.map(c => renderNode(c, depth + 1))}
      </div>
    );
  };

  const roots = tree.ROOT || [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Area Hierarchy</h1>
          <p className="text-brand-mute text-sm mt-1">Country → State → District → Area</p>
        </div>
        <button data-testid="add-root-btn" onClick={() => openCreate(null)} className="btn-primary"><Plus size={16} /> Country</button>
      </div>

      <div className="card-surface p-2">
        {roots.length === 0 && <div className="text-center py-12 text-brand-mute text-sm">No areas yet. Start by adding a Country.</div>}
        {roots.map(r => renderNode(r))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit Area" : "Add Area"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-3">
            <div><Label>Name *</Label><Input data-testid="area-name" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })} disabled={!!editing}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPE_ORDER.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Code (optional)</Label><Input value={form.code || ""} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-brand-line">Cancel</button>
            <button data-testid="save-area-btn" onClick={submit} className="btn-primary">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
