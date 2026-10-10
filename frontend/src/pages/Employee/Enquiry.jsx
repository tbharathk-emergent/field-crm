import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useApp, getLabel } from "@/context/AppContext";
import { postOrQueue } from "@/lib/offline";
import CustomFieldsForm from "@/components/CustomFieldsForm";
import { PageHeader, Split, StatusBadge } from "@/components/Layout/Page";

export default function Enquiry() {
  const { user, tenant, t, can } = useApp();
  const [list, setList] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [form, setForm] = useState({
    customer_id: "", customer_name: "", mobile: "", village: "", district: "",
    category: "", description: "", custom_data: {},
  });
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [newCust, setNewCust] = useState({
    phone: "", name: "", village: "", district: "", farm_size_acres: 0, crops: "", custom_data: {},
  });

  const load = async () => {
    // Enquiries are for END CUSTOMERS (farmers) — role="customer"
    const params = { role: "customer" };
    if (user?.role === "employee") params.assigned_employee_id = user.id;
    const [e, c] = await Promise.all([
      api.get("/enquiries"),
      api.get("/tenant/users", { params }),
    ]);
    setList(e.data);
    setCustomers(c.data);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const pickCustomer = (id) => {
    setSelectedCustomerId(id);
    const c = customers.find(x => x.id === id);
    if (c) {
      setForm(f => ({
        ...f,
        customer_id: c.id,
        customer_name: c.name || "",
        mobile: c.phone || "",
        village: c.village || "",
        district: c.district || "",
      }));
    }
  };

  const createInlineCustomer = async () => {
    if (!newCust.phone || !newCust.name) return toast.error("Phone & name required");
    if (!can("customers", "write")) return toast.error("You don't have permission to create customers");
    try {
      const payload = {
        ...newCust, role: "customer",
        assigned_employee_id: user?.role === "employee" ? user.id : "",
      };
      const res = await api.post("/tenant/users", payload);
      toast.success("Customer created");
      const params = { role: "customer" };
      if (user?.role === "employee") params.assigned_employee_id = user.id;
      const c = await api.get("/tenant/users", { params });
      setCustomers(c.data);
      setSelectedCustomerId(res.data.id);
      setForm(f => ({
        ...f,
        customer_id: res.data.id,
        customer_name: res.data.name,
        mobile: res.data.phone,
        village: res.data.village || "",
        district: res.data.district || "",
      }));
      setNewCustOpen(false);
      setNewCust({ phone: "", name: "", village: "", district: "", farm_size_acres: 0, crops: "", custom_data: {} });
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const submit = async () => {
    if (!form.customer_name) return toast.error("Name required");
    try {
      const res = await postOrQueue(api, "/enquiries", form, "enquiry");
      toast.success(res.offline ? "Saved offline — will sync" : "Enquiry created");
      setForm({ customer_id: "", customer_name: "", mobile: "", village: "", district: "", category: "", description: "", custom_data: {} });
      setSelectedCustomerId("");
      load();
    } catch { toast.error("Failed"); }
  };

  const label = getLabel(tenant, "customer", "Customer");
  const canCreateCust = can("customers", "write");

  const recent = (
    <>
      <h2 className="font-display text-base font-semibold">My Enquiries</h2>
      <div className="space-y-2">
        {list.slice(0, 20).map(e => (
          <div key={e.id} className="card-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium truncate">{e.customer_name}</div>
              <StatusBadge status={e.status} />
            </div>
            <div className="text-xs text-brand-mute mt-1">{[e.mobile, e.village].filter(Boolean).join(" · ")}</div>
            {e.description && <div className="text-xs text-brand-mute mt-1 line-clamp-2">{e.description}</div>}
          </div>
        ))}
        {list.length === 0 && <div className="card-surface p-6 text-center text-brand-mute text-sm">{t("no_data")}</div>}
      </div>
    </>
  );

  return (
    <div className="space-y-3 lg:space-y-5 pb-4">
      <PageHeader title={`${label} Enquiry`} subtitle={`Log an enquiry for an existing or walk-in ${label.toLowerCase()}`} />

      <Split aside={recent}>
        <div className="card-surface p-4 lg:p-6 grid grid-cols-1 gap-3 lg:gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <Label>Select existing {label.toLowerCase()} or leave blank for walk-in</Label>
            <div className="flex gap-2">
              <Select value={selectedCustomerId} onValueChange={pickCustomer}>
                <SelectTrigger data-testid="enq-select-customer" className="flex-1 min-w-0">
                  <SelectValue placeholder={`— New / Walk-in ${label} —`} />
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {c.phone}{c.village ? ` · ${c.village}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {canCreateCust && (
                <button data-testid="enq-new-customer-btn" onClick={() => setNewCustOpen(true)}
                        className="inline-flex items-center gap-1 px-3 rounded-lg border border-brand-primary text-brand-primary text-sm">
                  <UserPlus size={14} /> New
                </button>
              )}
            </div>
          </div>

          <div>
            <Label>{label} Name *</Label>
            <Input data-testid="enq-name" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
          </div>
          <div><Label>Mobile</Label><Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3 lg:gap-4">
            <div><Label>Village</Label><Input value={form.village} onChange={(e) => setForm({ ...form, village: e.target.value })} /></div>
            <div><Label>District</Label><Input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} /></div>
          </div>
          <div><Label>Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Crop / Issue" /></div>
          <div className="lg:col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></div>
          <div className="lg:col-span-2 empty:hidden">
            <CustomFieldsForm heading="Custom Fields" module="enquiry" data={form.custom_data || {}}
                              onChange={(cd) => setForm({ ...form, custom_data: cd })} />
          </div>
          <div className="lg:col-span-2 lg:flex lg:justify-end">
            <button data-testid="enq-submit" onClick={submit} className="btn-primary w-full lg:w-auto lg:min-w-[200px]">Submit</button>
          </div>
        </div>
      </Split>

      {/* Inline create farmer/customer modal */}
      <Dialog open={newCustOpen} onOpenChange={setNewCustOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create New {label}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-3">
            <div><Label>Phone *</Label><Input data-testid="new-cust-phone" value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} /></div>
            <div><Label>Name *</Label><Input data-testid="new-cust-name" value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Village</Label><Input value={newCust.village} onChange={(e) => setNewCust({ ...newCust, village: e.target.value })} /></div>
              <div><Label>District</Label><Input value={newCust.district} onChange={(e) => setNewCust({ ...newCust, district: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Farm (acres)</Label><Input type="number" step="0.1" value={newCust.farm_size_acres} onChange={(e) => setNewCust({ ...newCust, farm_size_acres: +e.target.value })} /></div>
              <div><Label>Crops</Label><Input value={newCust.crops} onChange={(e) => setNewCust({ ...newCust, crops: e.target.value })} placeholder="Cotton, Paddy" /></div>
            </div>
            <CustomFieldsForm heading="Custom Fields" module="customer" data={newCust.custom_data || {}}
                              onChange={(cd) => setNewCust({ ...newCust, custom_data: cd })} compact />
          </div>
          <DialogFooter>
            <button onClick={() => setNewCustOpen(false)} className="px-4 py-2 rounded-lg border border-brand-line">Cancel</button>
            <button data-testid="save-new-cust-btn" onClick={createInlineCustomer} className="btn-primary">Create</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
