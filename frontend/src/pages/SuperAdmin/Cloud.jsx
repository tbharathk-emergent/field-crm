import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Cloud as CloudIcon, KeyRound, Flame, Send, Plus, Trash2, RefreshCw, Save, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Super Admin → Cloud Settings (Phase 8)
 *
 * Three tabs:
 *   1. AWS S3 — set access key, secret, region, bucket, public media host.
 *   2. Firebase Projects — upload service-account JSON, see capacity, delete when unbound.
 *   3. Tenants — per-tenant Firebase app config (existing or auto-provisioned) + test push.
 */
const TABS = [
  { key: "aws", label: "AWS S3", icon: KeyRound },
  { key: "firebase", label: "Firebase Projects", icon: Flame },
  { key: "tenants", label: "Tenants", icon: Send },
];

export default function Cloud() {
  const [tab, setTab] = useState("aws");

  return (
    <div className="space-y-6" data-testid="super-cloud-page">
      <div>
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <CloudIcon size={22} /> Cloud & Notifications
        </h1>
        <p className="text-sm text-brand-mute mt-1">
          Configure AWS S3 storage credentials, Firebase projects, and per-tenant push apps.
        </p>
      </div>

      <div className="flex gap-2 border-b border-brand-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "inline-flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px transition " +
              (tab === t.key
                ? "border-brand-primary text-brand-ink font-medium"
                : "border-transparent text-brand-mute hover:text-brand-ink")
            }
            data-testid={`cloud-tab-${t.key}`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "aws" && <AwsSection />}
        {tab === "firebase" && <FirebaseSection />}
        {tab === "tenants" && <TenantsSection />}
      </div>
    </div>
  );
}

// ───────────────────────── AWS ─────────────────────────
function AwsSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState({
    aws_access_key_id: "",
    aws_secret_access_key: "",
    aws_region: "ap-south-1",
    aws_bucket_name: "",
    aws_public_media_host: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/super/aws-credentials");
        setSaved(r.data);
        setForm({
          aws_access_key_id: r.data.aws_access_key_id || "",
          aws_secret_access_key: "",
          aws_region: r.data.aws_region || "ap-south-1",
          aws_bucket_name: r.data.aws_bucket_name || "",
          aws_public_media_host: r.data.aws_public_media_host || "",
        });
      } catch (e) {
        toast.error("Failed to load AWS settings");
      } finally { setLoading(false); }
    })();
  }, []);

  const save = async () => {
    if (!form.aws_secret_access_key) {
      toast.error("Enter the AWS secret access key (it is not shown after saving)");
      return;
    }
    setSaving(true);
    try {
      const r = await api.put("/super/aws-credentials", form);
      const verify = r.data.verify || {};
      if (verify.ok) toast.success("AWS credentials saved & bucket verified");
      else if (verify.attempted) toast.warning(`Saved, but bucket check failed: ${verify.error?.slice(0, 100)}`);
      else toast.success("AWS credentials saved");
      // Refresh the masked view
      const r2 = await api.get("/super/aws-credentials");
      setSaved(r2.data);
      setForm({ ...form, aws_secret_access_key: "" });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  if (loading) return <Loader />;

  return (
    <div className="card-surface p-5 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="text-sm text-brand-mute">S3 direct-upload presigning</div>
        <StatusChip ok={saved?.configured} okLabel="Configured" offLabel="Not configured" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="AWS_ACCESS_KEY_ID" testid="aws-access-key-id">
          <Input value={form.aws_access_key_id}
                 onChange={(e) => setForm({ ...form, aws_access_key_id: e.target.value.trim() })}
                 placeholder="AKIA…" />
        </Field>
        <Field label="AWS_SECRET_ACCESS_KEY" hint={saved?.aws_secret_access_key_masked ? `saved: ${saved.aws_secret_access_key_masked}` : ""} testid="aws-secret-access-key">
          <Input type="password"
                 value={form.aws_secret_access_key}
                 onChange={(e) => setForm({ ...form, aws_secret_access_key: e.target.value.trim() })}
                 placeholder={saved?.aws_secret_access_key_masked ? "(leave blank to keep saved)" : "40+ characters"} />
        </Field>
        <Field label="AWS_REGION" testid="aws-region">
          <Input value={form.aws_region}
                 onChange={(e) => setForm({ ...form, aws_region: e.target.value.trim() })}
                 placeholder="ap-south-1" />
        </Field>
        <Field label="AWS_BUCKET_NAME" testid="aws-bucket-name">
          <Input value={form.aws_bucket_name}
                 onChange={(e) => setForm({ ...form, aws_bucket_name: e.target.value.trim() })}
                 placeholder="my-bucket" />
        </Field>
        <Field label="AWS_PUBLIC_MEDIA_HOST" hint="e.g. media.acme.com (CDN host in front of S3)" className="sm:col-span-2" testid="aws-public-host">
          <Input value={form.aws_public_media_host}
                 onChange={(e) => setForm({ ...form, aws_public_media_host: e.target.value.trim() })}
                 placeholder="media.your-domain.com" />
        </Field>
      </div>

      <div className="pt-2 flex gap-2">
        <button onClick={save} disabled={saving} className="btn-primary inline-flex items-center gap-2" data-testid="aws-save-btn">
          {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Save & Verify
        </button>
      </div>
    </div>
  );
}

// ───────────────────────── FIREBASE PROJECTS ─────────────────────────
function FirebaseSection() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/super/firebase-projects");
      setProjects(r.data || []);
    } catch { toast.error("Failed to load Firebase projects"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (p) => {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    try {
      await api.delete(`/super/firebase-projects/${p.id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    }
  };

  const refresh = async (p) => {
    try {
      const r = await api.post(`/super/firebase-projects/${p.id}/refresh`);
      toast.success(`Refreshed — ${r.data.total} apps on project`);
      load();
    } catch (e) {
      const d = e?.response?.data?.detail;
      toast.error(typeof d === "object" ? d.message : d || "Refresh failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-brand-mute">
          Each Firebase project holds up to 30 apps (≈15 tenants @ 1 Android + 1 iOS).
        </p>
        <button onClick={() => setShowAdd(true)} className="btn-primary inline-flex items-center gap-2" data-testid="firebase-add-btn">
          <Plus size={14} /> Add Firebase Project
        </button>
      </div>

      {loading ? <Loader /> : (
        projects.length === 0 ? (
          <div className="border border-dashed border-brand-line rounded-2xl p-6 text-sm text-brand-mute text-center">
            No Firebase projects yet. Upload a service-account JSON to get started.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((p) => (
              <div key={p.id} className="card-surface p-4 space-y-2" data-testid={`firebase-project-${p.project_id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <code className="text-xs text-brand-mute">{p.project_id}</code>
                  </div>
                  <div className="flex gap-1">
                    <IconBtn onClick={() => refresh(p)} title="Refresh app count"><RefreshCw size={14} /></IconBtn>
                    <IconBtn onClick={() => remove(p)} title="Delete" danger><Trash2 size={14} /></IconBtn>
                  </div>
                </div>
                <div className="flex gap-3 text-xs">
                  <span className="text-brand-mute">Apps:</span>
                  <span className="font-medium">{p.apps_provisioned}/{p.max_apps}</span>
                  <span className="text-brand-mute">•</span>
                  <span className="text-brand-mute">Tenants bound:</span>
                  <span className="font-medium">{p.tenants_bound}</span>
                </div>
                <CapacityBar used={p.apps_provisioned} max={p.max_apps} />
              </div>
            ))}
          </div>
        )
      )}

      {showAdd && <AddFirebaseModal onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function AddFirebaseModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [saJson, setSaJson] = useState("");
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setSaJson(text);
    try {
      const parsed = JSON.parse(text);
      if (parsed.project_id && !projectId) setProjectId(parsed.project_id);
      if (parsed.project_id && !name) setName(parsed.project_id);
    } catch { /* keep the raw text — validated on save */ }
  };

  const save = async () => {
    let parsed;
    try { parsed = JSON.parse(saJson); }
    catch { toast.error("Service-account JSON is not valid JSON"); return; }
    if (parsed.type !== "service_account") { toast.error("This JSON is not a Google service-account key"); return; }
    setBusy(true);
    try {
      await api.post("/super/firebase-projects", { name, project_id: projectId, service_account_json: parsed });
      toast.success("Firebase project added");
      onCreated();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to add");
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title="Add Firebase Project" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Display Name" testid="add-fb-name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Shard 1 — Follo" />
        </Field>
        <Field label="Firebase Project ID" testid="add-fb-project-id">
          <Input value={projectId} onChange={(e) => setProjectId(e.target.value.trim())} placeholder="follo-prod-123" />
        </Field>
        <Field label="Service Account JSON" hint="Upload the JSON key file OR paste its contents below.">
          <input type="file" accept="application/json" onChange={onFile} className="text-xs" data-testid="add-fb-sa-file" />
          <Textarea value={saJson} onChange={(e) => setSaJson(e.target.value)}
                    rows={7} placeholder='{"type":"service_account",...}' className="font-mono text-xs mt-2"
                    data-testid="add-fb-sa-text" />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={busy || !name || !projectId || !saJson}
                  className="btn-primary inline-flex items-center gap-2" data-testid="add-fb-submit">
            {busy ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Add
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ───────────────────────── PER-TENANT ─────────────────────────
function TenantsSection() {
  const [tenants, setTenants] = useState([]);
  const [projects, setProjects] = useState([]);
  const [active, setActive] = useState(null);
  const [config, setConfig] = useState(null);

  useEffect(() => {
    (async () => {
      const [t, p] = await Promise.all([
        api.get("/super/tenants"),
        api.get("/super/firebase-projects"),
      ]);
      setTenants(t.data || []);
      setProjects(p.data || []);
      if (t.data?.length) setActive(t.data[0]);
    })();
  }, []);

  const reloadConfig = async (tid) => {
    try {
      const r = await api.get(`/super/tenants/${tid}/firebase-config`);
      setConfig(r.data);
    } catch { setConfig(null); }
  };
  useEffect(() => { if (active?.id) reloadConfig(active.id); }, [active?.id]);

  if (!tenants.length) return <div className="text-brand-mute">No tenants yet.</div>;

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <aside className="card-surface p-2 space-y-1 max-h-[600px] overflow-y-auto" data-testid="tenant-list">
        {tenants.map((t) => (
          <button key={t.id}
                  onClick={() => setActive(t)}
                  className={"w-full text-left px-3 py-2 rounded-lg text-sm transition " +
                    (active?.id === t.id ? "bg-brand-primary/10 text-brand-primary font-medium" : "hover:bg-brand-bg")}
                  data-testid={`tenant-row-${t.slug}`}>
            <div>{t.name || t.slug}</div>
            <div className="text-[11px] text-brand-mute">{t.slug}</div>
          </button>
        ))}
      </aside>

      <div className="space-y-4">
        {config ? (
          <>
            <PlatformCard
              platform="android"
              app={config.android}
              projects={projects}
              tenantId={active.id}
              onChanged={() => reloadConfig(active.id)}
            />
            <PlatformCard
              platform="ios"
              app={config.ios}
              projects={projects}
              tenantId={active.id}
              onChanged={() => reloadConfig(active.id)}
            />
            <PushTest tenantId={active.id} tenantName={active.name || active.slug} />
          </>
        ) : <Loader />}
      </div>
    </div>
  );
}

function PlatformCard({ platform, app, projects, tenantId, onChanged }) {
  const [showEdit, setShowEdit] = useState(false);
  const [showProvision, setShowProvision] = useState(false);

  const unbind = async () => {
    if (!window.confirm(`Unbind ${platform} app?`)) return;
    try {
      await api.delete(`/super/tenants/${tenantId}/firebase-config/${platform}`);
      toast.success(`${platform} unbound`);
      onChanged();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="card-surface p-4 space-y-3" data-testid={`platform-card-${platform}`}>
      <div className="flex items-center justify-between">
        <div className="font-medium flex items-center gap-2">
          {platform === "android" ? "🤖 Android app" : "🍎 iOS app"}
          {app ? (
            app.mode === "auto"
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Auto-provisioned</span>
              : <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700">Existing</span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Not configured</span>
          )}
        </div>
        {app && <IconBtn onClick={unbind} danger title="Unbind"><Trash2 size={14} /></IconBtn>}
      </div>

      {app ? (
        <div className="grid sm:grid-cols-2 gap-2 text-xs">
          <KV k="App ID" v={app.app_id} />
          <KV k="Package / Bundle" v={app.package_name} />
          <KV k="Firebase Project" v={app.firebase_project_id?.slice(0, 8) + "…"} />
          {app.provisioning_error && (
            <div className="sm:col-span-2 text-xs text-red-600 flex items-start gap-1.5 bg-red-50 p-2 rounded">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <div><strong>Provisioning error:</strong> {app.provisioning_error}</div>
            </div>
          )}
          {app.config_json && (
            <details className="sm:col-span-2 mt-1">
              <summary className="text-xs text-brand-mute cursor-pointer">Show config file</summary>
              <pre className="text-[10px] font-mono bg-neutral-50 p-2 rounded mt-1 max-h-40 overflow-auto">{app.config_json}</pre>
            </details>
          )}
        </div>
      ) : (
        <div className="text-xs text-brand-mute">No {platform} Firebase app bound to this tenant.</div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={() => setShowEdit(true)} className="btn-secondary text-xs" data-testid={`edit-existing-${platform}`}>
          {app?.mode === "existing" ? "Update existing" : "Use existing Firebase app"}
        </button>
        {projects.length > 0 && (
          <button onClick={() => setShowProvision(true)} className="btn-primary text-xs" data-testid={`provision-${platform}`}>
            Auto-provision new app
          </button>
        )}
      </div>

      {showEdit && (
        <ExistingModal platform={platform} app={app} projects={projects} tenantId={tenantId}
                       onClose={() => setShowEdit(false)}
                       onSaved={() => { setShowEdit(false); onChanged(); }} />
      )}
      {showProvision && (
        <ProvisionModal platform={platform} projects={projects} tenantId={tenantId}
                        onClose={() => setShowProvision(false)}
                        onSaved={() => { setShowProvision(false); onChanged(); }} />
      )}
    </div>
  );
}

function ExistingModal({ platform, app, projects, tenantId, onClose, onSaved }) {
  const [form, setForm] = useState({
    firebase_project_id: app?.firebase_project_id || "",
    app_id: app?.app_id || "",
    package_name: app?.package_name || "",
    config_json: app?.config_json || "",
  });
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setForm({ ...form, config_json: await f.text() });
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/super/tenants/${tenantId}/firebase-config`, {
        platform, ...form, firebase_project_id: form.firebase_project_id || null,
      });
      toast.success(`${platform} config saved`);
      onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <ModalShell title={`Existing ${platform} Firebase app`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Firebase Project (optional link)">
          <select value={form.firebase_project_id}
                  onChange={(e) => setForm({ ...form, firebase_project_id: e.target.value })}
                  className="w-full h-9 rounded-md border border-brand-line px-2 text-sm bg-white">
            <option value="">— none —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.project_id})</option>
            ))}
          </select>
        </Field>
        <Field label={`App ID (${platform === "android" ? "1:xxx:android:yyy" : "1:xxx:ios:yyy"})`}>
          <Input value={form.app_id} onChange={(e) => setForm({ ...form, app_id: e.target.value.trim() })} />
        </Field>
        <Field label={platform === "android" ? "Package Name" : "Bundle ID"}>
          <Input value={form.package_name} onChange={(e) => setForm({ ...form, package_name: e.target.value.trim() })}
                 placeholder={platform === "android" ? "com.acme.app" : "com.acme.app"} />
        </Field>
        <Field label={platform === "android" ? "google-services.json" : "GoogleService-Info.plist"}>
          <input type="file" accept={platform === "android" ? "application/json" : ".plist"} onChange={onFile} className="text-xs" />
          <Textarea value={form.config_json} onChange={(e) => setForm({ ...form, config_json: e.target.value })}
                    rows={7} className="font-mono text-[11px] mt-2" />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={save} disabled={busy || !form.app_id} className="btn-primary inline-flex items-center gap-2">
            {busy ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} Save
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ProvisionModal({ platform, projects, tenantId, onClose, onSaved }) {
  const [firebaseProjectId, setFirebaseProjectId] = useState(projects[0]?.id || "");
  const [packageOrBundle, setPackageOrBundle] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const provision = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await api.post(`/super/tenants/${tenantId}/firebase-config/provision`, {
        platform, firebase_project_id: firebaseProjectId,
        package_or_bundle: packageOrBundle || null,
      });
      setResult(r.data);
      if (r.data.ok) {
        toast.success(`${platform} app provisioned`);
        setTimeout(onSaved, 700);
      } else {
        toast.error(r.data.result?.error?.slice(0, 120) || "Provisioning failed");
      }
    } catch (e) {
      const d = e?.response?.data?.detail;
      const msg = typeof d === "object" ? d.message : d;
      toast.error(msg || "Failed");
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title={`Auto-provision ${platform} app`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Firebase Project (target)">
          <select value={firebaseProjectId}
                  onChange={(e) => setFirebaseProjectId(e.target.value)}
                  className="w-full h-9 rounded-md border border-brand-line px-2 text-sm bg-white"
                  data-testid={`provision-project-select-${platform}`}>
            {projects.map((p) => (
              <option key={p.id} value={p.id} disabled={p.apps_provisioned >= p.max_apps}>
                {p.name} ({p.apps_provisioned}/{p.max_apps})
              </option>
            ))}
          </select>
        </Field>
        <Field label={platform === "android" ? "Package Name (optional)" : "Bundle ID (optional)"}
               hint="Leave blank to derive from the tenant slug.">
          <Input value={packageOrBundle} onChange={(e) => setPackageOrBundle(e.target.value.trim())} placeholder="in.localappstore.fieldcrm.<slug>" />
        </Field>
        {result && !result.ok && (
          <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
            <strong>Error:</strong> {result.result?.error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-secondary">Close</button>
          <button onClick={provision} disabled={busy || !firebaseProjectId}
                  className="btn-primary inline-flex items-center gap-2"
                  data-testid={`provision-submit-${platform}`}>
            {busy ? <Loader2 className="animate-spin" size={14} /> : <Flame size={14} />} Provision
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function PushTest({ tenantId, tenantName }) {
  const [title, setTitle] = useState("Test notification");
  const [body, setBody] = useState(`Hello from FieldCRM (${tenantName})`);
  const [dryToken, setDryToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const send = async () => {
    setBusy(true); setResult(null);
    try {
      const r = await api.post(`/super/tenants/${tenantId}/push/test`, {
        title, body, dry_run_token: dryToken || null,
      });
      setResult(r.data);
      if (r.data.sent > 0) toast.success(`Sent ${r.data.sent}/${r.data.sent + r.data.failed}`);
      else if (r.data.disabled) toast.warning(`Disabled — ${r.data.disabled.slice(0, 100)}`);
      else toast.info(`Attempted ${r.data.tokens_targeted} tokens`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="card-surface p-4 space-y-3" data-testid="push-test-card">
      <div className="font-medium flex items-center gap-2"><Send size={16} /> Test push notification</div>
      <div className="grid sm:grid-cols-2 gap-2">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} data-testid="push-title-input" />
        </Field>
        <Field label="Body">
          <Input value={body} onChange={(e) => setBody(e.target.value)} data-testid="push-body-input" />
        </Field>
        <Field label="Dry-run token (optional)" hint="Inject one synthetic token if the tenant has no registered devices yet." className="sm:col-span-2">
          <Input value={dryToken} onChange={(e) => setDryToken(e.target.value.trim())} placeholder="e.g. cO...fake-fcm-token" data-testid="push-dry-token-input" />
        </Field>
      </div>
      <div>
        <button onClick={send} disabled={busy} className="btn-primary inline-flex items-center gap-2" data-testid="push-send-btn">
          {busy ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />} Send
        </button>
      </div>
      {result && (
        <pre className="text-[11px] font-mono bg-neutral-50 p-2 rounded max-h-60 overflow-auto" data-testid="push-result">
{JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ───────────────────────── Small helpers ─────────────────────────
function Field({ label, hint, children, className = "", testid }) {
  return (
    <div className={className}>
      <Label className="text-xs">{label}</Label>
      <div data-testid={testid}>{children}</div>
      {hint && <div className="text-[11px] text-brand-mute mt-1">{hint}</div>}
    </div>
  );
}
function StatusChip({ ok, okLabel, offLabel }) {
  return ok
    ? <span className="inline-flex items-center gap-1 text-xs text-brand-primary"><CheckCircle2 size={12} /> {okLabel}</span>
    : <span className="inline-flex items-center gap-1 text-xs text-amber-600"><AlertCircle size={12} /> {offLabel}</span>;
}
function IconBtn({ onClick, children, title, danger }) {
  return (
    <button onClick={onClick} title={title} type="button"
            className={"p-1.5 rounded-md border border-brand-line " + (danger ? "text-red-600 hover:bg-red-50" : "hover:bg-neutral-50")}>
      {children}
    </button>
  );
}
function KV({ k, v }) {
  return (
    <div><span className="text-brand-mute">{k}:</span> <span className="font-mono">{v || "—"}</span></div>
  );
}
function CapacityBar({ used, max }) {
  const pct = Math.min(100, Math.round((used / (max || 1)) * 100));
  const colour = pct > 85 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-brand-primary";
  return (
    <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
      <div className={"h-full " + colour} style={{ width: `${pct}%` }} />
    </div>
  );
}
function Loader() {
  return <div className="text-brand-mute inline-flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading…</div>;
}
function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-3 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="font-medium">{title}</div>
          <button onClick={onClose} className="text-brand-mute hover:text-brand-ink"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
