import React, { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp, getLabel } from "@/context/AppContext";
import CustomFieldsForm from "@/components/CustomFieldsForm";

export default function Products() {
  const { tenant, t } = useApp();
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [search, setSearch] = useState("");
  const fileRef = useRef(null);

  const load = async () => {
    const res = await api.get("/tenant/products");
    setList(res.data);
  };
  useEffect(() => { load(); }, []);

  const view = list.filter((p) => !search || `${p.name} ${p.code || ""} ${p.category || ""}`.toLowerCase().includes(search.toLowerCase()));

  const blank = { name: "", code: "", description: "", category: "", dosage: "", packing: "", mrp: 0, price: 0, stock: 0, is_active: true };
  const openCreate = () => { setEditing(null); setForm(blank); setOpen(true); };
  const openEdit = (p) => { setEditing(p); setForm({ ...p }); setOpen(true); };

  const submit = async () => {
    try {
      if (editing) await api.patch(`/tenant/products/${editing.id}`, form);
      else await api.post("/tenant/products", form);
      toast.success("Saved");
      setOpen(false);
      load();
    } catch (e) { toast.error("Failed"); }
  };

  const del = async (id) => {
    if (!confirm("Disable?")) return;
    await api.delete(`/tenant/products/${id}`);
    load();
  };

  const exportXlsx = () => {
    const token = localStorage.getItem("fc_token");
    window.open(`${api.defaults.baseURL}/export/products?fmt=xlsx&auth=${token}`, "_blank");
  };

  const importFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    try {
      const res = await api.post("/import/products", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Imported ${res.data.inserted}`);
      load();
    } catch { toast.error("Import failed"); }
  };

  const label = getLabel(tenant, "product_plural", "Products");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">{label}</h1>
          <p className="text-brand-mute text-sm mt-1">{list.length} total</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportXlsx} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-line text-sm"><Download size={14} /> Export</button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx" hidden onChange={importFile} />
          <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-line text-sm"><Upload size={14} /> Import</button>
          <button data-testid="add-product-btn" onClick={openCreate} className="btn-primary"><Plus size={16} /> Add</button>
        </div>
      </div>

      <div className="card-surface p-4">
        <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {view.map((p) => (
          <div key={p.id} className="card-surface p-4">
            <div className="aspect-square bg-brand-bg rounded-xl mb-3 flex items-center justify-center text-3xl font-display font-bold text-brand-primary/40">
              {p.name?.[0]}
            </div>
            <div className="font-display font-semibold truncate">{p.name}</div>
            <div className="text-xs text-brand-mute">{p.code} · {p.category}</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-display text-xl font-bold text-brand-primary">₹{p.price}</span>
              {p.mrp > p.price && <span className="text-xs text-brand-mute line-through">₹{p.mrp}</span>}
            </div>
            <div className="text-xs text-brand-mute mt-1">{p.packing}</div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => openEdit(p)} className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-lg border border-brand-line text-xs hover:bg-brand-bg"><Pencil size={12} /> Edit</button>
              <button onClick={() => del(p.id)} className="inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg border border-brand-line text-brand-mute hover:text-brand-error"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
        {view.length === 0 && <div className="col-span-full text-center text-brand-mute py-12">{t("no_data")}</div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Product</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3 py-3">
            <div><Label>Name *</Label><Input data-testid="product-name" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Code</Label><Input value={form.code || ""} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><Label>Category</Label><Input value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
            <div><Label>Dosage</Label><Input value={form.dosage || ""} onChange={(e) => setForm({ ...form, dosage: e.target.value })} /></div>
            <div><Label>Packing</Label><Input value={form.packing || ""} onChange={(e) => setForm({ ...form, packing: e.target.value })} /></div>
            <div><Label>Stock</Label><Input type="number" value={form.stock || 0} onChange={(e) => setForm({ ...form, stock: +e.target.value })} /></div>
            <div><Label>MRP</Label><Input type="number" value={form.mrp || 0} onChange={(e) => setForm({ ...form, mrp: +e.target.value })} /></div>
            <div><Label>Price</Label><Input data-testid="product-price" type="number" value={form.price || 0} onChange={(e) => setForm({ ...form, price: +e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Description</Label><Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <div className="pt-2 border-t border-brand-line">
            <div className="text-xs text-brand-mute mb-2 uppercase tracking-wider">Custom Fields</div>
            <CustomFieldsForm module="product" data={form.custom_data || {}}
                              onChange={(cd) => setForm({ ...form, custom_data: cd })} />
          </div>
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-brand-line">Cancel</button>
            <button data-testid="save-product-btn" onClick={submit} className="btn-primary">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
