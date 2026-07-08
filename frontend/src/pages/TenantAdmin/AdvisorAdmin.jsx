import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Sprout, Bug, Leaf, AlertTriangle, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useApp } from "@/context/AppContext";

/* Admin Crop Advisor content manager. Consolidated tabs:
 * Crops · Diseases · Pests · Deficiencies · Seasonal Alerts */

const TABS = [
  { key: "crops",       label: "Crops",         icon: Sprout,         type: null },
  { key: "diseases",    label: "Diseases",      icon: Leaf,           type: "disease" },
  { key: "pests",       label: "Pests",         icon: Bug,            type: "pest" },
  { key: "deficiencies",label: "Deficiencies",  icon: Sprout,         type: "deficiency" },
  { key: "seasonal",    label: "Alerts",        icon: AlertTriangle,  type: null },
];

export default function AdvisorAdmin() {
  const { hasFeature } = useApp();
  const [tab, setTab] = useState("crops");
  if (!hasFeature("crop_advisor")) {
    return (
      <div className="text-center py-12 text-brand-mute">
        <Sprout size={48} className="mx-auto mb-3" />
        Crop Advisor feature is disabled for this tenant. Contact Super Admin to enable.
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold">Crop Health Advisor</h1>
        <p className="text-brand-mute text-sm mt-1">Manage crops, diseases, pests, deficiencies, and seasonal alerts.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((tobj) => {
          const Icon = tobj.icon;
          const active = tab === tobj.key;
          return (
            <button key={tobj.key} data-testid={`admin-tab-${tobj.key}`} onClick={() => setTab(tobj.key)}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium ${
                      active ? "bg-brand-primary text-white border-brand-primary" : "bg-white border-brand-line text-brand-ink"
                    }`}>
              <Icon size={14} /> {tobj.label}
            </button>
          );
        })}
      </div>
      {tab === "crops" && <CropsTab />}
      {(tab === "diseases" || tab === "pests" || tab === "deficiencies") && (
        <AdvisoryTab key={tab} type={TABS.find(t => t.key === tab).type} />
      )}
      {tab === "seasonal" && <SeasonalTab />}
    </div>
  );
}

/* ---------------- Crops CRUD ---------------- */
function CropsTab() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const load = () => api.get("/crops").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);
  const blank = { name: "", scientific_name: "", season: "", description: "", order: 0, is_active: true };
  const openCreate = () => { setEditing(null); setForm(blank); setOpen(true); };
  const openEdit = (c) => { setEditing(c); setForm({ ...c }); setOpen(true); };
  const submit = async () => {
    if (!form.name) return toast.error("Name required");
    try {
      if (editing) await api.patch(`/crops/${editing.id}`, form);
      else await api.post("/crops", form);
      toast.success("Saved"); setOpen(false); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const del = async (id) => { if (!confirm("Disable?")) return; await api.delete(`/crops/${id}`); load(); };
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button data-testid="crop-add-btn" onClick={openCreate} className="btn-primary"><Plus size={14} /> Add Crop</button>
      </div>
      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg text-brand-mute text-xs uppercase">
            <tr><th className="text-left px-4 py-3">Name</th><th className="text-left px-4 py-3">Scientific</th><th className="text-left px-4 py-3">Season</th><th className="text-left px-4 py-3">Order</th><th></th></tr>
          </thead>
          <tbody className="divide-y divide-brand-line">
            {list.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 italic text-brand-mute">{c.scientific_name}</td>
                <td className="px-4 py-3">{c.season}</td>
                <td className="px-4 py-3">{c.order}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => openEdit(c)} className="p-1 text-brand-mute hover:text-brand-primary"><Pencil size={14} /></button>
                  <button onClick={() => del(c.id)} className="p-1 text-brand-mute hover:text-brand-error ml-1"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan="5" className="text-center py-8 text-brand-mute">No crops yet</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Crop</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Name *</Label><Input data-testid="crop-name" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Scientific Name</Label><Input value={form.scientific_name || ""} onChange={(e) => setForm({ ...form, scientific_name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Season</Label><Input value={form.season || ""} onChange={(e) => setForm({ ...form, season: e.target.value })} placeholder="Kharif / Rabi" /></div>
              <div><Label>Order</Label><Input type="number" value={form.order || 0} onChange={(e) => setForm({ ...form, order: +e.target.value })} /></div>
            </div>
            <div><Label>Description</Label><Textarea rows={3} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-brand-line">Cancel</button>
            <button data-testid="crop-save-btn" onClick={submit} className="btn-primary">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- Advisory Entry CRUD (Disease/Pest/Deficiency) ---------------- */
function AdvisoryTab({ type }) {
  const [list, setList] = useState([]);
  const [crops, setCrops] = useState([]);
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const load = () => {
    api.get("/advisory-entries", { params: { type, limit: 200, published_only: false } })
      .then((r) => setList(r.data.items || []));
    api.get("/crops").then((r) => setCrops(r.data));
    api.get("/tenant/products").then((r) => setProducts(r.data));
  };
  useEffect(() => { load(); }, [type]);
  const blank = {
    type, name: "", scientific_name: "", crop_ids: [], category: type === "pest" ? "pest" : type === "deficiency" ? "nutrient_deficiency" : "fungal",
    severity: "medium", short_description: "", description: "", season: "",
    symptoms: [], causes: "", spread: [], weather: {},
    prevention: [], organic_treatment: "", bio_control: "", natural_remedies: "",
    chemical_treatment: {}, safety: { ppe: [], dos: [], donts: [] }, faqs: [],
    photos: [], documents: [], product_ids: [], keywords: [], is_published: true,
  };
  const openCreate = () => { setEditing(null); setForm(blank); setOpen(true); };
  const openEdit = (a) => { setEditing(a); setForm({ ...blank, ...a }); setOpen(true); };
  const submit = async () => {
    if (!form.name) return toast.error("Name required");
    try {
      if (editing) await api.patch(`/advisory-entries/${editing.id}`, form);
      else await api.post("/advisory-entries", form);
      toast.success("Saved"); setOpen(false); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const del = async (id) => { if (!confirm("Delete permanently?")) return; await api.delete(`/advisory-entries/${id}`); load(); };
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button data-testid={`advisory-add-btn-${type}`} onClick={openCreate} className="btn-primary"><Plus size={14} /> Add {type}</button>
      </div>
      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg text-brand-mute text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Category</th>
              <th className="text-left px-4 py-3">Severity</th>
              <th className="text-left px-4 py-3">Crops</th>
              <th className="text-left px-4 py-3">Published</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-line">
            {list.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-medium">
                  {a.name}
                  <div className="text-[11px] italic text-brand-mute">{a.scientific_name}</div>
                </td>
                <td className="px-4 py-3 capitalize">{a.category?.replace("_", " ")}</td>
                <td className="px-4 py-3 capitalize">{a.severity}</td>
                <td className="px-4 py-3 text-xs">{crops.filter(c => a.crop_ids?.includes(c.id)).map(c => c.name).join(", ")}</td>
                <td className="px-4 py-3">{a.is_published ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => openEdit(a)} className="p-1 text-brand-mute hover:text-brand-primary"><Pencil size={14} /></button>
                  <button onClick={() => del(a.id)} className="p-1 text-brand-mute hover:text-brand-error ml-1"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan="6" className="text-center py-8 text-brand-mute">No entries yet</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} {type}</DialogTitle></DialogHeader>
          {form && <AdvisoryForm form={form} setForm={setForm} crops={crops} products={products} />}
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-brand-line">Cancel</button>
            <button data-testid="advisory-save-btn" onClick={submit} className="btn-primary">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdvisoryForm({ form, setForm, crops, products }) {
  const set = (k, v) => setForm({ ...form, [k]: v });
  const setDeep = (path, val) => {
    const [a, b] = path.split(".");
    setForm({ ...form, [a]: { ...(form[a] || {}), [b]: val } });
  };
  const toggleCrop = (id) => set("crop_ids", (form.crop_ids || []).includes(id) ? form.crop_ids.filter((x) => x !== id) : [...(form.crop_ids || []), id]);
  const toggleProduct = (id) => set("product_ids", (form.product_ids || []).includes(id) ? form.product_ids.filter((x) => x !== id) : [...(form.product_ids || []), id]);
  const catOptions = form.type === "pest" ? ["pest"] : form.type === "deficiency" ? ["nutrient_deficiency"] : ["fungal", "viral", "bacterial"];

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Name *</Label><Input data-testid="advisory-name" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><Label>Scientific Name</Label><Input value={form.scientific_name || ""} onChange={(e) => set("scientific_name", e.target.value)} /></div>
        <div>
          <Label>Category</Label>
          <Select value={form.category} onValueChange={(v) => set("category", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{catOptions.map((c) => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Severity</Label>
          <Select value={form.severity} onValueChange={(v) => set("severity", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["low", "medium", "high", "critical"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Season</Label><Input value={form.season || ""} onChange={(e) => set("season", e.target.value)} /></div>
        <div className="flex items-end">
          <label className="inline-flex items-center gap-2 text-sm">
            <Checkbox checked={form.is_published} onCheckedChange={(c) => set("is_published", !!c)} />
            Published
          </label>
        </div>
      </div>

      <div>
        <Label>Short Description</Label>
        <Input value={form.short_description || ""} onChange={(e) => set("short_description", e.target.value)} />
      </div>
      <div>
        <Label>Full Description</Label>
        <Textarea rows={3} value={form.description || ""} onChange={(e) => set("description", e.target.value)} />
      </div>

      <div>
        <Label>Affects Crops</Label>
        <div className="flex flex-wrap gap-1 mt-1">
          {crops.map((c) => (
            <button key={c.id} type="button" onClick={() => toggleCrop(c.id)}
                    className={`px-2 py-1 rounded-full text-xs border ${form.crop_ids?.includes(c.id) ? "bg-brand-primary text-white border-brand-primary" : "border-brand-line text-brand-mute"}`}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <ArrayField label="Symptoms (bullets)" values={form.symptoms} onChange={(v) => set("symptoms", v)} />
      <div><Label>Cause</Label><Textarea rows={2} value={form.causes || ""} onChange={(e) => set("causes", e.target.value)} /></div>

      <div>
        <Label>Spreads via</Label>
        <div className="flex flex-wrap gap-1 mt-1">
          {["wind", "water", "seed", "soil", "insects", "other"].map((s) => (
            <button key={s} type="button" onClick={() => set("spread", (form.spread || []).includes(s) ? form.spread.filter((x) => x !== s) : [...(form.spread || []), s])}
                    className={`px-2 py-1 rounded-full text-xs border capitalize ${form.spread?.includes(s) ? "bg-brand-primary text-white border-brand-primary" : "border-brand-line text-brand-mute"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <fieldset className="border border-brand-line rounded-lg p-2">
        <legend className="text-xs px-1 text-brand-mute">Weather Conditions</legend>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Temperature" value={form.weather?.temperature || ""} onChange={(e) => setDeep("weather.temperature", e.target.value)} />
          <Input placeholder="Humidity" value={form.weather?.humidity || ""} onChange={(e) => setDeep("weather.humidity", e.target.value)} />
          <Input placeholder="Rainfall" value={form.weather?.rainfall || ""} onChange={(e) => setDeep("weather.rainfall", e.target.value)} />
          <Input placeholder="Season" value={form.weather?.season || ""} onChange={(e) => setDeep("weather.season", e.target.value)} />
        </div>
      </fieldset>

      <ArrayField label="Prevention measures" values={form.prevention} onChange={(v) => set("prevention", v)} />
      <div><Label>Organic Treatment</Label><Textarea rows={2} value={form.organic_treatment || ""} onChange={(e) => set("organic_treatment", e.target.value)} /></div>
      <div><Label>Bio-control</Label><Input value={form.bio_control || ""} onChange={(e) => set("bio_control", e.target.value)} /></div>
      <div><Label>Natural Remedies</Label><Input value={form.natural_remedies || ""} onChange={(e) => set("natural_remedies", e.target.value)} /></div>

      <fieldset className="border border-brand-line rounded-lg p-2">
        <legend className="text-xs px-1 text-brand-mute">Chemical Treatment</legend>
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Product name" value={form.chemical_treatment?.product_name || ""} onChange={(e) => setDeep("chemical_treatment.product_name", e.target.value)} />
          <Input placeholder="Active ingredient" value={form.chemical_treatment?.active_ingredient || ""} onChange={(e) => setDeep("chemical_treatment.active_ingredient", e.target.value)} />
          <Input placeholder="Dosage (e.g. 0.6 g/L)" value={form.chemical_treatment?.dosage || ""} onChange={(e) => setDeep("chemical_treatment.dosage", e.target.value)} />
          <Input placeholder="Water quantity (e.g. 200 L/acre)" value={form.chemical_treatment?.water_quantity || ""} onChange={(e) => setDeep("chemical_treatment.water_quantity", e.target.value)} />
          <Input placeholder="Spray interval" value={form.chemical_treatment?.spray_interval || ""} onChange={(e) => setDeep("chemical_treatment.spray_interval", e.target.value)} />
          <Input placeholder="Max applications" value={form.chemical_treatment?.max_applications || ""} onChange={(e) => setDeep("chemical_treatment.max_applications", e.target.value)} />
          <Input placeholder="Waiting period" value={form.chemical_treatment?.waiting_period || ""} onChange={(e) => setDeep("chemical_treatment.waiting_period", e.target.value)} />
        </div>
      </fieldset>

      <fieldset className="border border-brand-line rounded-lg p-2">
        <legend className="text-xs px-1 text-brand-mute">Safety</legend>
        <ArrayField label="PPE" values={form.safety?.ppe || []} onChange={(v) => setDeep("safety.ppe", v)} compact />
        <ArrayField label="Do's" values={form.safety?.dos || []} onChange={(v) => setDeep("safety.dos", v)} compact />
        <ArrayField label="Don'ts" values={form.safety?.donts || []} onChange={(v) => setDeep("safety.donts", v)} compact />
        <Input placeholder="First Aid" value={form.safety?.first_aid || ""} onChange={(e) => setDeep("safety.first_aid", e.target.value)} />
        <Input placeholder="Storage" value={form.safety?.storage || ""} onChange={(e) => setDeep("safety.storage", e.target.value)} className="mt-2" />
      </fieldset>

      <div>
        <Label>Recommended Products</Label>
        <div className="flex flex-wrap gap-1 mt-1 max-h-40 overflow-y-auto">
          {products.map((p) => (
            <button key={p.id} type="button" onClick={() => toggleProduct(p.id)}
                    className={`px-2 py-1 rounded-full text-xs border ${form.product_ids?.includes(p.id) ? "bg-brand-primary text-white border-brand-primary" : "border-brand-line text-brand-mute"}`}>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <FAQEditor faqs={form.faqs} onChange={(v) => set("faqs", v)} />
      <PhotoEditor photos={form.photos} onChange={(v) => set("photos", v)} />
      <DocumentEditor documents={form.documents} onChange={(v) => set("documents", v)} />

      <div>
        <Label>Keywords (comma separated)</Label>
        <Input value={(form.keywords || []).join(", ")}
               onChange={(e) => set("keywords", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} />
      </div>
    </div>
  );
}

function ArrayField({ label, values = [], onChange, compact }) {
  return (
    <div className={compact ? "" : "space-y-1"}>
      {!compact && <Label>{label}</Label>}
      {compact && <div className="text-xs text-brand-mute mt-2">{label}</div>}
      <div className="space-y-1">
        {values.map((v, i) => (
          <div key={i} className="flex gap-2">
            <Input value={v} onChange={(e) => { const n = [...values]; n[i] = e.target.value; onChange(n); }} />
            <button onClick={() => onChange(values.filter((_, x) => x !== i))} className="px-2 rounded-lg border border-brand-line text-brand-error"><X size={12} /></button>
          </div>
        ))}
        <button onClick={() => onChange([...values, ""])} className="text-xs text-brand-primary font-medium">+ Add</button>
      </div>
    </div>
  );
}

function FAQEditor({ faqs = [], onChange }) {
  return (
    <div>
      <Label>FAQs</Label>
      <div className="space-y-2">
        {faqs.map((f, i) => (
          <div key={i} className="flex gap-2 items-start">
            <div className="flex-1 space-y-1">
              <Input placeholder="Question" value={f.q} onChange={(e) => { const n = [...faqs]; n[i] = { ...f, q: e.target.value }; onChange(n); }} />
              <Textarea rows={2} placeholder="Answer" value={f.a} onChange={(e) => { const n = [...faqs]; n[i] = { ...f, a: e.target.value }; onChange(n); }} />
            </div>
            <button onClick={() => onChange(faqs.filter((_, x) => x !== i))} className="px-2 py-2 rounded-lg border border-brand-line text-brand-error"><X size={12} /></button>
          </div>
        ))}
        <button onClick={() => onChange([...faqs, { q: "", a: "" }])} className="text-xs text-brand-primary font-medium">+ Add FAQ</button>
      </div>
    </div>
  );
}

function PhotoEditor({ photos = [], onChange }) {
  const [uploading, setUploading] = useState(false);
  const upload = async (e, stage) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange([...photos, { path: res.data.url || res.data.path, stage, label: stage }]);
    } catch { toast.error("Upload failed"); }
    finally { setUploading(false); }
  };
  return (
    <div>
      <Label>Photos (upload — no video)</Label>
      <div className="grid grid-cols-5 gap-2 mt-1">
        {["healthy", "early", "medium", "advanced", "closeup"].map((stg) => (
          <label key={stg} className="cursor-pointer">
            <div className="aspect-square rounded-lg border-2 border-dashed border-brand-line flex flex-col items-center justify-center text-[10px] text-brand-mute p-1 text-center capitalize hover:border-brand-primary transition">
              <Plus size={16} /><span>{stg}</span>
            </div>
            <input type="file" accept="image/*" hidden onChange={(e) => upload(e, stg)} />
          </label>
        ))}
      </div>
      {uploading && <div className="text-xs text-brand-mute">Uploading...</div>}
      <div className="grid grid-cols-4 gap-2 mt-2">
        {photos.map((p, i) => (
          <div key={i} className="relative">
            <img src={p.path} alt="" className="aspect-square object-cover rounded-lg" />
            <div className="text-[10px] text-brand-mute mt-1 capitalize">{p.stage}</div>
            <button onClick={() => onChange(photos.filter((_, x) => x !== i))} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center"><X size={10} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function DocumentEditor({ documents = [], onChange }) {
  const [uploading, setUploading] = useState(false);
  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange([...documents, { name: f.name, path: res.data.url || res.data.path, doc_type: f.name.toLowerCase().endsWith(".pdf") ? "pdf" : "image", size_kb: Math.round(f.size / 1024) }]);
    } catch { toast.error("Upload failed"); }
    finally { setUploading(false); }
  };
  return (
    <div>
      <Label>Documents (PDF / Image only — no video)</Label>
      <label className="mt-1 cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-brand-line text-brand-primary text-sm w-max">
        <Plus size={14} /> Upload PDF/Image
        <input type="file" accept="image/*,.pdf" hidden onChange={upload} />
      </label>
      {uploading && <div className="text-xs text-brand-mute">Uploading...</div>}
      <div className="space-y-1 mt-2">
        {documents.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-sm p-2 rounded-lg border border-brand-line">
            <span className="flex-1 truncate">{d.name}</span>
            <span className="text-[10px] uppercase text-brand-mute">{d.doc_type}</span>
            <button onClick={() => onChange(documents.filter((_, x) => x !== i))} className="text-brand-error"><X size={12} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Seasonal Advisories ---------------- */
function SeasonalTab() {
  const [list, setList] = useState([]);
  const [crops, setCrops] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const load = () => {
    api.get("/seasonal-advisories").then((r) => setList(r.data));
    api.get("/crops").then((r) => setCrops(r.data));
  };
  useEffect(() => { load(); }, []);
  const blank = { title: "", message: "", severity: "medium", crop_ids: [], states: [], districts: [], regions: [], valid_from: "", valid_to: "", is_published: true };
  const openCreate = () => { setEditing(null); setForm(blank); setOpen(true); };
  const openEdit = (s) => { setEditing(s); setForm({ ...s }); setOpen(true); };
  const submit = async () => {
    if (!form.title || !form.message) return toast.error("Title & message required");
    try {
      if (editing) await api.patch(`/seasonal-advisories/${editing.id}`, form);
      else await api.post("/seasonal-advisories", form);
      toast.success("Saved"); setOpen(false); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const del = async (id) => { if (!confirm("Delete?")) return; await api.delete(`/seasonal-advisories/${id}`); load(); };
  const toggleCrop = (id) => setForm({ ...form, crop_ids: (form.crop_ids || []).includes(id) ? form.crop_ids.filter(x => x !== id) : [...(form.crop_ids || []), id] });
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button data-testid="seasonal-add-btn" onClick={openCreate} className="btn-primary"><Plus size={14} /> Add Alert</button>
      </div>
      <div className="grid gap-2">
        {list.map((s) => (
          <div key={s.id} className="card-surface p-4">
            <div className="flex justify-between">
              <div>
                <div className="font-display font-semibold">{s.title}</div>
                <div className="text-sm text-brand-mute mt-1">{s.message}</div>
                <div className="text-[11px] text-brand-mute mt-2 flex flex-wrap gap-2">
                  <span className="uppercase font-medium">{s.severity}</span>
                  {s.valid_from && <span>· {s.valid_from} → {s.valid_to || "∞"}</span>}
                  {s.states.length > 0 && <span>· {s.states.join(", ")}</span>}
                  {!s.is_published && <span className="text-brand-error">· UNPUBLISHED</span>}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openEdit(s)} className="p-1 text-brand-mute hover:text-brand-primary"><Pencil size={14} /></button>
                <button onClick={() => del(s.id)} className="p-1 text-brand-mute hover:text-brand-error"><Trash2 size={14} /></button>
              </div>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="text-center text-brand-mute py-8">No alerts</div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} Alert</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3 py-2">
              <div><Label>Title *</Label><Input data-testid="seasonal-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Message *</Label><Textarea rows={3} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Severity</Label>
                  <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{["low", "medium", "high", "critical"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <Checkbox checked={form.is_published} onCheckedChange={(c) => setForm({ ...form, is_published: !!c })} /> Published
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Valid From</Label><Input type="date" value={form.valid_from || ""} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></div>
                <div><Label>Valid Until</Label><Input type="date" value={form.valid_to || ""} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} /></div>
              </div>
              <div><Label>States (comma separated)</Label><Input value={(form.states || []).join(", ")} onChange={(e) => setForm({ ...form, states: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></div>
              <div><Label>Districts (comma separated)</Label><Input value={(form.districts || []).join(", ")} onChange={(e) => setForm({ ...form, districts: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></div>
              <div>
                <Label>Target Crops</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {crops.map((c) => (
                    <button key={c.id} type="button" onClick={() => toggleCrop(c.id)}
                            className={`px-2 py-1 rounded-full text-xs border ${form.crop_ids?.includes(c.id) ? "bg-brand-primary text-white border-brand-primary" : "border-brand-line text-brand-mute"}`}>
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-brand-line">Cancel</button>
            <button data-testid="seasonal-save-btn" onClick={submit} className="btn-primary">Save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
