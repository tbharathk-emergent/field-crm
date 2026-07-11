import React, { useEffect, useState } from "react";
import { Plus, ExternalLink, Pencil, Copy, Upload as UploadIcon, Loader2, Flame, X } from "lucide-react";
import { toast } from "sonner";
import { api, fileUrl } from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const BUSINESSES = ["Agriculture", "FMCG", "Pharma", "Manufacturing", "Service", "Other"];
const LANGS = ["en", "hi", "te", "ta", "kn", "mr"];
const ROOT_DOMAIN = process.env.REACT_APP_ROOT_DOMAIN || "fieldcrm.localappstore.in";

/** Build the tenant's subdomain URL (Phase 9). */
const tenantUrl = (slug) => `https://${slug}.${ROOT_DOMAIN}`;
const legalUrl = (slug, kind) => `${tenantUrl(slug)}/legal/${kind}`;

const LEGAL_URL_KINDS = [
  { kind: "privacy", label: "Privacy URL" },
  { kind: "terms", label: "Terms URL" },
];

/**
 * Renders the tenant's logo as an <img> when a `logo_path` is set on the
 * tenant record. Falls back to a coloured initial-letter block on error or
 * when no logo has been uploaded.
 *
 * Uses React state for the fallback (not DOM manipulation) so it survives
 * re-renders and Playwright timing-sensitive assertions.
 */
function TenantLogo({ tn }) {
  const [failed, setFailed] = useState(false);
  const showImg = !!tn.logo_path && !failed;
  const primary = tn.theme?.primary || "#2C5E43";

  if (showImg) {
    return (
      <img
        data-testid={`tenant-logo-${tn.slug}`}
        src={fileUrl(tn.logo_path)}
        alt={`${tn.name} logo`}
        className="w-12 h-12 rounded-xl object-cover border border-brand-line bg-white flex-shrink-0"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      data-testid={`tenant-logo-fallback-${tn.slug}`}
      className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-display font-bold flex-shrink-0"
      style={{ background: primary }}
      aria-label={`${tn.name} logo (fallback)`}
    >
      {tn.name?.[0]?.toUpperCase() || "T"}
    </div>
  );
}

export default function Tenants() {
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [fbProjects, setFbProjects] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [fbForm, setFbForm] = useState({ mode: "none", firebase_project_id: "", android_app_id: "", ios_app_id: "", android_package: "", ios_bundle: "" });
  const [savingLogo, setSavingLogo] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const [t, p, fp] = await Promise.all([
      api.get("/super/tenants"),
      api.get("/super/plans"),
      api.get("/super/firebase-projects").catch(() => ({ data: [] })),
    ]);
    setTenants(t.data);
    setPlans(p.data);
    setFbProjects(fp.data || []);
  };

  useEffect(() => { load(); }, []);

  const blankForm = {
    slug: "", name: "", business_type: "Agriculture",
    contact_email: "", contact_phone: "", address: "",
    plan_id: "", primary: "#2C5E43", secondary: "#D35400",
    customer_label: "Customer", dealer_label: "Dealer",
    default_language: "en", admin_phone: "", admin_name: "",
    logo_path: "",
  };

  const openCreate = () => {
    setEditing(null); setForm(blankForm);
    setFbForm({ mode: "none", firebase_project_id: "", android_app_id: "", ios_app_id: "", android_package: "", ios_bundle: "" });
    setOpen(true);
  };
  const openEdit = async (tn) => {
    setEditing(tn);
    setForm({
      name: tn.name, business_type: tn.business_type, contact_email: tn.contact_email,
      contact_phone: tn.contact_phone, address: tn.address, plan_id: tn.plan_id,
      plan_status: tn.plan_status, is_active: tn.is_active,
      google_maps_api_key: tn.google_maps_api_key || "",
      order_approval_flow: tn.order_approval_flow || "direct",
      logo_path: tn.logo_path || "",
    });
    // Load current Firebase config so the dialog pre-fills
    try {
      const r = await api.get(`/super/tenants/${tn.id}/firebase-config`);
      const cfg = r.data || {};
      const android = cfg.android || {};
      const ios = cfg.ios || {};
      const anyAuto = android.mode === "auto" || ios.mode === "auto";
      const anyExisting = android.mode === "existing" || ios.mode === "existing";
      setFbForm({
        mode: anyAuto ? "auto" : (anyExisting ? "existing" : "none"),
        firebase_project_id: android.firebase_project_id || ios.firebase_project_id || "",
        android_app_id: android.app_id || "",
        ios_app_id: ios.app_id || "",
        android_package: android.package_name || "",
        ios_bundle: ios.package_name || "",
      });
    } catch {
      setFbForm({ mode: "none", firebase_project_id: "", android_app_id: "", ios_app_id: "", android_package: "", ios_bundle: "" });
    }
    setOpen(true);
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    setSavingLogo(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("purpose", "tenant_logo");
      const r = await api.post("/files/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({ ...f, logo_path: r.data.path }));
      toast.success("Logo uploaded");
    } catch (e) {
      toast.error("Logo upload failed");
    } finally {
      setSavingLogo(false);
    }
  };

  /**
   * Persist Firebase config for the tenant after create/update saves.
   * - mode=none  → no-op.
   * - mode=existing → PUT the pasted app_ids for android + ios (independently).
   * - mode=auto → call /firebase-config/provision for android + ios.
   */
  const persistFirebase = async (tenantId) => {
    if (fbForm.mode === "none") return;
    if (fbForm.mode === "existing") {
      const calls = [];
      if (fbForm.android_app_id) {
        calls.push(api.put(`/super/tenants/${tenantId}/firebase-config`, {
          platform: "android",
          firebase_project_id: fbForm.firebase_project_id || null,
          app_id: fbForm.android_app_id,
          package_name: fbForm.android_package || null,
        }));
      }
      if (fbForm.ios_app_id) {
        calls.push(api.put(`/super/tenants/${tenantId}/firebase-config`, {
          platform: "ios",
          firebase_project_id: fbForm.firebase_project_id || null,
          app_id: fbForm.ios_app_id,
          package_name: fbForm.ios_bundle || null,
        }));
      }
      await Promise.all(calls);
      return;
    }
    if (fbForm.mode === "auto") {
      if (!fbForm.firebase_project_id) {
        toast.error("Pick a Firebase project for auto-provisioning");
        throw new Error("missing_firebase_project");
      }
      // Provision both platforms sequentially — the API returns even on failure.
      // The endpoint auto-falls-back to "re-provision" if the Firebase app for
      // that package/bundle already exists, so re-saving a tenant is safe.
      const results = [];
      for (const platform of ["android", "ios"]) {
        try {
          const r = await api.post(`/super/tenants/${tenantId}/firebase-config/provision`, {
            platform, firebase_project_id: fbForm.firebase_project_id,
          });
          results.push({ platform, ok: r.data.ok, reused: r.data.reused,
                         error: r.data.result?.error });
        } catch (e) {
          results.push({ platform, ok: false, error: e?.response?.data?.detail || "Failed" });
        }
      }
      const failed = results.filter((r) => !r.ok);
      if (failed.length) {
        toast.warning(`Firebase auto-provision partial: ${failed.map((f) => `${f.platform}: ${typeof f.error === "object" ? f.error?.message : f.error}`).join("; ").slice(0, 200)}`);
      } else {
        const reused = results.filter((r) => r.reused).map((r) => r.platform);
        if (reused.length === results.length) {
          toast.success("Firebase config refreshed (apps already existed)");
        } else if (reused.length) {
          toast.success(`Firebase apps ready (${reused.join(" + ")} re-fetched, others newly created)`);
        } else {
          toast.success("Firebase apps auto-provisioned");
        }
      }
      return;
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      let tenantId = editing?.id;
      if (editing) {
        await api.patch(`/super/tenants/${editing.id}`, form);
        toast.success("Tenant updated");
      } else {
        const r = await api.post("/super/tenants", form);
        tenantId = r.data.id;
        toast.success("Tenant created");
      }
      // Persist Firebase after the tenant exists (needed for provisioning IDs).
      if (tenantId) {
        try { await persistFirebase(tenantId); }
        catch (e) { /* toasts already shown by persistFirebase */ }
      }
      setOpen(false);
      load();
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "object" ? (d.message || d.code) : (d || "Failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const copyLegalUrl = async (slug, kind, label) => {
    const url = legalUrl(slug, kind);
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`${label} copied`);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); toast.success(`${label} copied`); }
      catch { toast.error("Copy failed — long-press to copy"); }
      finally { document.body.removeChild(ta); }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Tenants</h1>
          <p className="text-brand-mute text-sm mt-1">{tenants.length} total</p>
        </div>
        <button data-testid="add-tenant-btn" onClick={openCreate} className="btn-primary">
          <Plus size={16} /> New Tenant
        </button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tenants.map((tn) => (
          <div key={tn.id} data-testid={`tenant-card-${tn.slug}`} className="card-surface p-5 hover:shadow-md transition">
            <div className="flex items-start gap-3 mb-3">
              <TenantLogo tn={tn} />
              <div className="min-w-0 flex-1">
                <div className="font-display font-semibold truncate">{tn.name}</div>
                <a href={tenantUrl(tn.slug)} target="_blank" rel="noreferrer"
                   className="text-xs text-brand-primary hover:underline truncate block"
                   data-testid={`tenant-subdomain-${tn.slug}`}>
                  {tn.slug}.{ROOT_DOMAIN}
                </a>
                <div className="flex gap-1 flex-wrap mt-1">
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary font-semibold">
                    {tn.business_type}
                  </span>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${
                    tn.is_active ? "bg-brand-success/10 text-brand-success" : "bg-brand-error/10 text-brand-error"
                  }`}>
                    {tn.is_active ? "active" : "disabled"}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div className="bg-brand-bg rounded-lg p-2">
                <div className="text-xs text-brand-mute">Staff</div>
                <div className="font-display font-bold">{tn.stats?.employees ?? 0}</div>
              </div>
              <div className="bg-brand-bg rounded-lg p-2">
                <div className="text-xs text-brand-mute">Customers</div>
                <div className="font-display font-bold">{tn.stats?.customers ?? 0}</div>
              </div>
            </div>

            {/* Feature toggles (industry modules) */}
            <div className="flex items-center justify-between text-xs bg-emerald-50 border border-emerald-200 rounded-lg p-2 mb-3">
              <span className="font-medium text-emerald-800">Crop Health Advisor</span>
              <button
                data-testid={`toggle-crop-advisor-${tn.slug}`}
                onClick={async () => {
                  const enabled = !((tn.features || {}).crop_advisor);
                  try {
                    await api.patch(`/super-admin/tenants/${tn.id}/features`, { features: { crop_advisor: enabled } });
                    toast.success(`Crop Advisor ${enabled ? "enabled" : "disabled"}`);
                    load();
                  } catch { toast.error("Failed"); }
                }}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  (tn.features || {}).crop_advisor ? "bg-emerald-600 text-white" : "bg-white border border-emerald-300 text-emerald-700"
                }`}
              >
                {(tn.features || {}).crop_advisor ? "Enabled" : "Enable"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <button data-testid={`edit-tenant-${tn.slug}`} onClick={() => openEdit(tn)}
                      className="flex-1 min-w-[80px] inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-brand-line text-sm hover:bg-brand-bg">
                <Pencil size={14} /> Edit
              </button>
              {LEGAL_URL_KINDS.map(({ kind, label }) => (
                <button key={kind} data-testid={`copy-${kind}-${tn.slug}`}
                        onClick={() => copyLegalUrl(tn.slug, kind, label)}
                        className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-brand-line text-sm hover:bg-brand-bg"
                        title={`Copy ${label}`}>
                  <Copy size={14} /> {label}
                </button>
              ))}
              <a href={tenantUrl(tn.slug)} target="_blank" rel="noreferrer"
                 className="flex-1 min-w-[80px] inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-brand-primary/10 text-brand-primary text-sm font-medium hover:bg-brand-primary/20">
                <ExternalLink size={14} /> Visit
              </a>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Tenant" : "Create New Tenant"}</DialogTitle>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4 py-3">
            {!editing && (
              <div>
                <Label>Slug *</Label>
                <Input data-testid="tenant-slug" value={form.slug || ""} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="akshara" />
              </div>
            )}
            <div>
              <Label>Name *</Label>
              <Input data-testid="tenant-name" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Akshara Agro" />
            </div>
            <div>
              <Label>Business Type</Label>
              <Select value={form.business_type} onValueChange={(v) => setForm({ ...form, business_type: v })}>
                <SelectTrigger data-testid="tenant-business"><SelectValue /></SelectTrigger>
                <SelectContent>{BUSINESSES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Plan</Label>
              <Select value={form.plan_id || ""} onValueChange={(v) => setForm({ ...form, plan_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>{plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Contact Email</Label>
              <Input value={form.contact_email || ""} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
            </div>
            <div>
              <Label>Contact Phone</Label>
              <Input value={form.contact_phone || ""} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Address</Label>
              <Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <Label>Primary Color</Label>
              <Input type="color" value={form.primary || "#2C5E43"} onChange={(e) => setForm({ ...form, primary: e.target.value })} />
            </div>
            <div>
              <Label>Secondary Color</Label>
              <Input type="color" value={form.secondary || "#D35400"} onChange={(e) => setForm({ ...form, secondary: e.target.value })} />
            </div>
            {!editing && (
              <>
                <div>
                  <Label>Customer Label (e.g. Farmer, Patient)</Label>
                  <Input data-testid="customer-label" value={form.customer_label || ""} onChange={(e) => setForm({ ...form, customer_label: e.target.value })} />
                </div>
                <div>
                  <Label>Dealer Label</Label>
                  <Input value={form.dealer_label || ""} onChange={(e) => setForm({ ...form, dealer_label: e.target.value })} />
                </div>
                <div>
                  <Label>Default Language</Label>
                  <Select value={form.default_language} onValueChange={(v) => setForm({ ...form, default_language: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{LANGS.map((l) => <SelectItem key={l} value={l}>{l.toUpperCase()}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Admin Phone</Label>
                  <Input data-testid="admin-phone" value={form.admin_phone || ""} onChange={(e) => setForm({ ...form, admin_phone: e.target.value })} placeholder="9XXXXXXXXX" />
                </div>
                <div className="sm:col-span-2">
                  <Label>Admin Name</Label>
                  <Input value={form.admin_name || ""} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} />
                </div>
              </>
            )}
            {editing && (
              <>
                <div>
                  <Label>Order Approval Flow</Label>
                  <Select value={form.order_approval_flow || "direct"} onValueChange={(v) => setForm({ ...form, order_approval_flow: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct">Direct (no approval)</SelectItem>
                      <SelectItem value="sales_exec">Sales Executive</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Tenant Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Google Maps API Key (optional)</Label>
                  <Input value={form.google_maps_api_key || ""} onChange={(e) => setForm({ ...form, google_maps_api_key: e.target.value })} placeholder="Defaults to OpenStreetMap" />
                </div>
                <div className="flex items-center gap-3 sm:col-span-2">
                  <Switch checked={!!form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                  <Label>Tenant Active</Label>
                </div>
              </>
            )}
          </div>

          {/* Logo (Phase 9) */}
          <div className="border-t border-brand-line pt-4 mt-1">
            <Label className="text-xs uppercase tracking-widest text-brand-mute">Tenant Logo</Label>
            <div className="mt-2 flex items-center gap-3">
              {form.logo_path ? (
                <img
                  data-testid="tenant-logo-preview"
                  src={form.logo_path.startsWith("http") ? form.logo_path : fileUrl(form.logo_path)}
                  alt="logo preview"
                  className="w-14 h-14 rounded-xl object-cover border border-brand-line bg-white"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-neutral-100 flex items-center justify-center text-brand-mute text-xs">
                  No logo
                </div>
              )}
              <label className="btn-secondary inline-flex items-center gap-2 cursor-pointer" data-testid="tenant-logo-upload-btn">
                {savingLogo ? <Loader2 size={14} className="animate-spin" /> : <UploadIcon size={14} />}
                {form.logo_path ? "Replace logo" : "Upload logo"}
                <input type="file" accept="image/*" className="hidden"
                       onChange={(e) => uploadLogo(e.target.files?.[0])}
                       data-testid="tenant-logo-file" />
              </label>
              {form.logo_path && (
                <button type="button" onClick={() => setForm({ ...form, logo_path: "" })}
                        className="text-xs text-brand-mute hover:text-red-600 inline-flex items-center gap-1">
                  <X size={12} /> Clear
                </button>
              )}
            </div>
          </div>

          {/* Firebase configuration (Phase 9) */}
          <div className="border-t border-brand-line pt-4 mt-1">
            <Label className="text-xs uppercase tracking-widest text-brand-mute inline-flex items-center gap-1.5">
              <Flame size={12} /> Firebase Configuration
            </Label>
            <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
              {[
                { k: "none", label: "None / Later" },
                { k: "existing", label: "Existing Firebase" },
                { k: "auto", label: "Auto-provision" },
              ].map((opt) => (
                <button key={opt.k} type="button"
                        data-testid={`fb-mode-${opt.k}`}
                        onClick={() => setFbForm({ ...fbForm, mode: opt.k })}
                        className={
                          "px-3 py-2 rounded-lg border text-xs transition " +
                          (fbForm.mode === opt.k
                            ? "border-brand-primary bg-brand-primary/10 text-brand-primary font-medium"
                            : "border-brand-line hover:bg-brand-bg")
                        }>
                  {opt.label}
                </button>
              ))}
            </div>

            {(fbForm.mode === "existing" || fbForm.mode === "auto") && (
              <div className="mt-3">
                <Label className="text-xs">Firebase Project</Label>
                <select
                  data-testid="fb-project-select"
                  value={fbForm.firebase_project_id}
                  onChange={(e) => setFbForm({ ...fbForm, firebase_project_id: e.target.value })}
                  className="w-full h-9 rounded-md border border-brand-line px-2 text-sm bg-white mt-1"
                >
                  <option value="">— select a Firebase project —</option>
                  {fbProjects.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.apps_provisioned >= p.max_apps}>
                      {p.name} ({p.apps_provisioned}/{p.max_apps})
                    </option>
                  ))}
                </select>
                {fbProjects.length === 0 && (
                  <div className="text-[11px] text-amber-700 mt-1">
                    No Firebase projects yet. Add one from{" "}
                    <a href="/super-admin/cloud" target="_blank" rel="noreferrer" className="underline">Cloud → Firebase Projects</a>.
                  </div>
                )}
              </div>
            )}

            {fbForm.mode === "existing" && (
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Android App ID</Label>
                  <Input data-testid="fb-android-app-id"
                         value={fbForm.android_app_id}
                         onChange={(e) => setFbForm({ ...fbForm, android_app_id: e.target.value.trim() })}
                         placeholder="1:1234:android:abcdef" />
                </div>
                <div>
                  <Label className="text-xs">Android Package Name</Label>
                  <Input data-testid="fb-android-package"
                         value={fbForm.android_package}
                         onChange={(e) => setFbForm({ ...fbForm, android_package: e.target.value.trim() })}
                         placeholder="in.localappstore.fieldcrm.<slug>" />
                </div>
                <div>
                  <Label className="text-xs">iOS App ID</Label>
                  <Input data-testid="fb-ios-app-id"
                         value={fbForm.ios_app_id}
                         onChange={(e) => setFbForm({ ...fbForm, ios_app_id: e.target.value.trim() })}
                         placeholder="1:1234:ios:abcdef" />
                </div>
                <div>
                  <Label className="text-xs">iOS Bundle ID</Label>
                  <Input data-testid="fb-ios-bundle"
                         value={fbForm.ios_bundle}
                         onChange={(e) => setFbForm({ ...fbForm, ios_bundle: e.target.value.trim() })}
                         placeholder="in.localappstore.fieldcrm.<slug>" />
                </div>
              </div>
            )}

            {fbForm.mode === "auto" && (
              <div className="mt-3 text-xs bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-900">
                <strong>Auto-provisioning</strong> will create one Android + one iOS app on the selected Firebase project once you save. App IDs and config files are generated by Firebase and stored on this tenant.
              </div>
            )}
          </div>

          <DialogFooter>
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-brand-line">Cancel</button>
            <button data-testid="save-tenant-btn" onClick={submit} disabled={submitting} className="btn-primary inline-flex items-center gap-2">
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {editing ? "Save" : "Create"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
