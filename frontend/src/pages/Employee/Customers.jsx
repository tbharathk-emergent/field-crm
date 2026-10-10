import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Phone, MapPin, Pencil, Sprout } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useApp, getLabel } from "@/context/AppContext";
import CustomFieldsForm from "@/components/CustomFieldsForm";
import { PageHeader, DataTable } from "@/components/Layout/Page";

export default function Customers() {
  const { user, tenant, t, can } = useApp();
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const canWrite = can("customers", "write");

  const load = () => {
    const params = { role: "customer" };
    if (user?.role === "employee") params.assigned_employee_id = user.id;
    api.get("/tenant/users", { params }).then(r => setList(r.data));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const view = list.filter(u => !search || `${u.name} ${u.phone} ${u.village || ""} ${u.crops || ""}`.toLowerCase().includes(search.toLowerCase()));

  const blank = {
    phone: "", name: "", role: "customer",
    address: "", village: "", district: "", state: "", pincode: "",
    farm_size_acres: 0, crops: "",
    assigned_employee_id: user?.role === "employee" ? user.id : "",
  };
  const openCreate = () => { setEditing(null); setForm(blank); setOpen(true); };
  const openEdit = (u) => { setEditing(u); setForm({ ...u }); setOpen(true); };

  const submit = async () => {
    if (!form.phone || !form.name) return toast.error("Phone & name required");
    try {
      if (editing) await api.patch(`/tenant/users/${editing.id}`, form);
      else await api.post("/tenant/users", { ...form, role: "customer" });
      toast.success("Saved");
      setOpen(false);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const label = getLabel(tenant, "customer_plural", "Customers");
  const singular = getLabel(tenant, "customer", "Customer");

  const place = (u) => [u.village, u.district].filter(Boolean).join(", ") || "—";
  const actions = (u) => (
    <div className="flex gap-1 flex-shrink-0 justify-end">
      {canWrite && (
        <button aria-label="edit" onClick={() => openEdit(u)} className="w-9 h-9 rounded-full border border-brand-line flex items-center justify-center text-brand-mute hover:bg-brand-bg"><Pencil size={14} /></button>
      )}
      <a aria-label="call" href={`tel:${u.phone}`} className="w-9 h-9 rounded-full bg-brand-primary text-white flex items-center justify-center"><Phone size={14} /></a>
    </div>
  );
  const searchBox = <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />;

  return (
    <div className="space-y-3 lg:space-y-5 pb-4">
      <PageHeader title={`My ${label}`} subtitle={`${view.length} of ${list.length} shown`}>
        <div className="hidden lg:block w-72">{searchBox}</div>
        {canWrite && (
          <button data-testid="add-customer-btn" onClick={openCreate}
                  className="btn-primary text-sm px-3 py-1.5 lg:px-5 lg:py-2.5">
            <Plus size={14} /> <span>Add<span className="hidden lg:inline"> {singular}</span></span>
          </button>
        )}
      </PageHeader>
      <div className="lg:hidden">{searchBox}</div>

      {/* Desktop: one table. Phones: a card per customer. */}
      <div className="hidden lg:block">
        <DataTable
          testid="customers-table"
          rows={view}
          empty={t("no_data")}
          columns={[
            { key: "name", header: t("name"), cell: (u) => <span className="font-medium">{u.name}</span> },
            { key: "place", header: t("location"), cell: (u) => place(u) },
            { key: "crops", header: "Crops", cell: (u) => u.crops ? <span className="text-brand-primary">{u.crops}</span> : "—" },
            { key: "farm", header: "Farm size", align: "right", cell: (u) => u.farm_size_acres > 0 ? <span className="font-mono">{u.farm_size_acres} acres</span> : "—" },
            { key: "phone", header: t("phone_short"), cell: (u) => <span className="font-mono">{u.phone}</span> },
            { key: "actions", header: "", align: "right", cell: actions },
          ]}
        />
      </div>

      <div className="space-y-2 lg:hidden">
        {view.map(u => (
          <div key={u.id} className="card-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-display font-semibold truncate">{u.name}</div>
                <div className="text-xs text-brand-mute flex items-center gap-1 mt-1"><MapPin size={12} /> {place(u)}</div>
                {u.crops && <div className="text-xs text-brand-primary flex items-center gap-1 mt-1"><Sprout size={12} /> {u.crops}</div>}
              </div>
              {actions(u)}
            </div>
            {u.farm_size_acres > 0 && (
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-brand-mute">Farm size</span>
                <span className="font-mono font-semibold">{u.farm_size_acres} acres</span>
              </div>
            )}
          </div>
        ))}
        {view.length === 0 && <div className="text-center text-brand-mute py-8">{t("no_data")}</div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} {singular}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 gap-3 py-3 sm:grid-cols-2">
            <div><Label>Phone *</Label><Input data-testid="cust-phone" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Name *</Label><Input data-testid="cust-name" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Village</Label><Input value={form.village || ""} onChange={(e) => setForm({ ...form, village: e.target.value })} /></div>
              <div><Label>District</Label><Input value={form.district || ""} onChange={(e) => setForm({ ...form, district: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Farm (acres)</Label><Input type="number" step="0.1" value={form.farm_size_acres || 0} onChange={(e) => setForm({ ...form, farm_size_acres: +e.target.value })} /></div>
              <div><Label>Crops</Label><Input value={form.crops || ""} onChange={(e) => setForm({ ...form, crops: e.target.value })} placeholder="Cotton, Paddy" /></div>
            </div>
            <div className="sm:col-span-2"><Label>Address</Label><Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="sm:col-span-2 empty:hidden">
              <CustomFieldsForm heading="Custom Fields" module="customer" data={form.custom_data || {}}
                                onChange={(cd) => setForm({ ...form, custom_data: cd })} />
            </div>
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
