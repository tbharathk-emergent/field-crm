import React, { useState, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Upload, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/context/AppContext";
import TenantLogo from "@/components/TenantLogo";

const LANGS = [
  { code: "en", name: "English" }, { code: "hi", name: "हिन्दी" },
  { code: "te", name: "తెలుగు" }, { code: "ta", name: "தமிழ்" },
  { code: "kn", name: "ಕನ್ನಡ" }, { code: "mr", name: "मराठी" },
];

export default function Branding() {
  const { tenant, refreshTenant, applyTenantTheme } = useApp();
  const [form, setForm] = useState(() => ({
    name: tenant?.name || "",
    business_type: tenant?.business_type || "Agriculture",
    default_language: tenant?.default_language || "en",
    google_maps_api_key: tenant?.google_maps_api_key || "",
    order_approval_flow: tenant?.order_approval_flow || "direct",
    catalog_mode: tenant?.catalog_mode || "direct",
    theme: {
      primary: tenant?.theme?.primary || "#2C5E43",
      secondary: tenant?.theme?.secondary || "#D35400",
      primary_hover: tenant?.theme?.primary_hover || "#1e422f",
    },
    labels: {
      customer: tenant?.labels?.customer || "Customer",
      customer_plural: tenant?.labels?.customer_plural || "Customers",
      dealer: tenant?.labels?.dealer || "Dealer",
      dealer_plural: tenant?.labels?.dealer_plural || "Dealers",
      product: tenant?.labels?.product || "Product",
      product_plural: tenant?.labels?.product_plural || "Products",
      employee: tenant?.labels?.employee || "Employee",
      area: tenant?.labels?.area || "Area",
      visit: tenant?.labels?.visit || "Visit",
      collection: tenant?.labels?.collection || "Collection",
      sales: tenant?.labels?.sales || "Sales",
    },
    logo_path: tenant?.logo_path || null,
  }));
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const onTheme = (k, v) => {
    const theme = { ...form.theme, [k]: v };
    setForm({ ...form, theme });
    applyTenantTheme(theme);
  };

  const upload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("purpose", "tenant_logo");
      const res = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm({ ...form, logo_path: res.data.path });
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    try {
      await api.patch("/tenant/profile", form);
      await refreshTenant();
      toast.success("Branding saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display text-3xl font-bold">Branding & Configuration</h1>
        <p className="text-brand-mute text-sm mt-1">Make this app yours — logo, colors, labels & language.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-5">
          <div className="card-surface p-5 space-y-4">
            <h2 className="font-display font-semibold">Identity</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>App Name</Label><Input data-testid="brand-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>Business Type</Label>
                <Select value={form.business_type} onValueChange={(v) => setForm({ ...form, business_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Agriculture", "FMCG", "Pharma", "Manufacturing", "Service", "Other"].map(b =>
                      <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Logo</Label>
                <div className="flex items-center gap-3">
                  <TenantLogo tenant={{ ...tenant, logo_path: form.logo_path, name: form.name }} size={64} />
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={upload} data-testid="logo-file-input" />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-line hover:bg-brand-bg text-sm">
                    <Upload size={14} /> {uploading ? "..." : "Upload Logo"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="card-surface p-5 space-y-4">
            <h2 className="font-display font-semibold">Theme Colors</h2>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <Label>Primary</Label>
                <div className="flex gap-2 items-center">
                  <Input type="color" value={form.theme.primary} onChange={(e) => onTheme("primary", e.target.value)} className="w-14 p-1" />
                  <Input value={form.theme.primary} onChange={(e) => onTheme("primary", e.target.value)} data-testid="theme-primary" />
                </div>
              </div>
              <div>
                <Label>Primary Hover</Label>
                <div className="flex gap-2 items-center">
                  <Input type="color" value={form.theme.primary_hover} onChange={(e) => onTheme("primary_hover", e.target.value)} className="w-14 p-1" />
                  <Input value={form.theme.primary_hover} onChange={(e) => onTheme("primary_hover", e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Secondary</Label>
                <div className="flex gap-2 items-center">
                  <Input type="color" value={form.theme.secondary} onChange={(e) => onTheme("secondary", e.target.value)} className="w-14 p-1" />
                  <Input value={form.theme.secondary} onChange={(e) => onTheme("secondary", e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          <div className="card-surface p-5 space-y-4">
            <h2 className="font-display font-semibold">Configurable Labels</h2>
            <p className="text-xs text-brand-mute -mt-2">These words will appear everywhere in your app. E.g., set "Customer" to "Farmer" or "Patient".</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                ["customer", "Customer (singular)"], ["customer_plural", "Customer (plural)"],
                ["dealer", "Dealer (singular)"], ["dealer_plural", "Dealer (plural)"],
                ["product", "Product (singular)"], ["product_plural", "Product (plural)"],
                ["employee", "Employee"], ["area", "Area"], ["visit", "Visit"],
                ["collection", "Collection"], ["sales", "Sales"],
              ].map(([k, label]) => (
                <div key={k}>
                  <Label>{label}</Label>
                  <Input data-testid={`label-${k}`} value={form.labels[k] || ""} onChange={(e) => setForm({ ...form, labels: { ...form.labels, [k]: e.target.value } })} />
                </div>
              ))}
            </div>
          </div>

          <div className="card-surface p-5 space-y-4">
            <h2 className="font-display font-semibold">Operational</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Default Language</Label>
                <Select value={form.default_language} onValueChange={(v) => setForm({ ...form, default_language: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LANGS.map(l => <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Order Approval Flow</Label>
                <Select value={form.order_approval_flow} onValueChange={(v) => setForm({ ...form, order_approval_flow: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">Direct (no approval)</SelectItem>
                    <SelectItem value="sales_exec">Sales Executive approves</SelectItem>
                    <SelectItem value="manager">Manager approves</SelectItem>
                    <SelectItem value="admin">Tenant Admin approves</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Catalog Mode</Label>
                <Select value={form.catalog_mode} onValueChange={(v) => setForm({ ...form, catalog_mode: v })}>
                  <SelectTrigger data-testid="catalog-mode-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">Direct Purchase (show prices + cart)</SelectItem>
                    <SelectItem value="enquiry_only">Enquiry Only (hide prices, get enquiries)</SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-[11px] text-brand-mute mt-1">
                  In enquiry-only mode, product prices are hidden and customers submit enquiries instead of placing orders.
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label>Google Maps API Key (optional)</Label>
                <Input value={form.google_maps_api_key} onChange={(e) => setForm({ ...form, google_maps_api_key: e.target.value })} placeholder="Defaults to OpenStreetMap" />
              </div>
            </div>
          </div>

          <button data-testid="save-branding-btn" onClick={save} className="btn-primary">Save Changes</button>
        </div>

        {/* Live Preview */}
        <div className="space-y-4">
          <div className="card-surface p-5 sticky top-24">
            <div className="flex items-center gap-2 mb-3"><Eye size={16} /><h3 className="font-display font-semibold">Live Preview</h3></div>
            <div className="rounded-2xl border border-brand-line overflow-hidden">
              <div className="p-4" style={{ background: form.theme.primary }}>
                <div className="flex items-center gap-2 text-white">
                  <TenantLogo tenant={{ ...tenant, logo_path: form.logo_path, name: form.name, theme: form.theme }} size={36} />
                  <div className="font-display font-semibold">{form.name || "Your Brand"}</div>
                </div>
              </div>
              <div className="p-4 space-y-2 bg-white">
                <div className="text-xs text-brand-mute">Sample copy:</div>
                <div className="text-sm">My {form.labels.dealer_plural}</div>
                <div className="text-sm">{form.labels.customer} Enquiry</div>
                <div className="text-sm">{form.labels.product_plural} Catalogue</div>
                <button className="px-4 py-2 rounded-lg text-white text-sm" style={{ background: form.theme.primary }}>
                  {form.labels.visit} Report
                </button>
                <button className="px-4 py-2 rounded-lg text-white text-sm ml-2" style={{ background: form.theme.secondary }}>
                  New {form.labels.collection}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
