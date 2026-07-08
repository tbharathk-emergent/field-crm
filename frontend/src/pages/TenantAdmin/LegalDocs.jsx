import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { FileText, Save, Send, Loader2, CheckCircle2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Tenant Admin — Legal Documents CRUD (Phase 3).
 *
 * One tab per legal kind. Save creates a new draft version; Publish creates a
 * new published version (bumps `version` and demotes prior ones server-side).
 * The public route at /legal/:kind always serves the latest published row.
 */
const KINDS = [
  { key: "privacy", label: "Privacy Policy" },
  { key: "terms", label: "Terms of Service" },
  { key: "refund", label: "Refund Policy" },
  { key: "shipping", label: "Shipping Policy" },
  { key: "about", label: "About Us" },
  { key: "contact", label: "Contact Us" },
];

export default function LegalDocs() {
  const [activeKind, setActiveKind] = useState(KINDS[0].key);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ title: "", content_md: "", version: 0, is_published: false });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const r = await api.get(`/admin/legal/${activeKind}/latest`);
        if (!cancelled) {
          setForm({
            title: r.data.title || KINDS.find((k) => k.key === activeKind)?.label || "",
            content_md: r.data.content_md || "",
            version: r.data.version || 0,
            is_published: !!r.data.is_published,
          });
        }
      } catch {
        if (!cancelled) setForm({ title: "", content_md: "", version: 0, is_published: false });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [activeKind]);

  const save = async (publish) => {
    setBusy(true);
    try {
      const r = await api.post("/admin/legal", {
        kind: activeKind,
        title: form.title,
        content_md: form.content_md,
        publish,
      });
      toast.success(publish ? `Published v${r.data.version}` : `Draft saved v${r.data.version}`);
      setForm({
        title: r.data.title,
        content_md: r.data.content_md,
        version: r.data.version,
        is_published: r.data.is_published,
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="admin-legal-page">
      <div>
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <FileText size={22} /> Legal Documents
        </h1>
        <p className="text-sm text-brand-mute mt-1">
          Publish Privacy, Terms &amp; other legal documents required by the App Store and Play Store.
          Each publish creates a new immutable version; only the latest published version is served publicly.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="admin-legal-tabs">
        {KINDS.map((k) => (
          <button
            key={k.key}
            onClick={() => setActiveKind(k.key)}
            className={
              "px-3 py-1.5 rounded-full text-sm border transition " +
              (activeKind === k.key
                ? "bg-brand-primary text-white border-brand-primary"
                : "bg-white text-brand-ink border-brand-line hover:bg-neutral-50")
            }
            data-testid={`admin-legal-tab-${k.key}`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="card-surface p-5 space-y-4">
        {loading ? (
          <div className="text-brand-mute inline-flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading…</div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="text-xs text-brand-mute">
                Current version: <strong>{form.version || "—"}</strong>
                {form.is_published && (
                  <span className="ml-2 inline-flex items-center gap-1 text-brand-primary">
                    <CheckCircle2 size={12} /> Published
                  </span>
                )}
              </div>
            </div>

            <div>
              <Label>Title</Label>
              <Input
                data-testid="admin-legal-title-input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Privacy Policy"
              />
            </div>

            <div>
              <Label>Content (Markdown supported)</Label>
              <Textarea
                data-testid="admin-legal-content-input"
                rows={16}
                value={form.content_md}
                onChange={(e) => setForm({ ...form, content_md: e.target.value })}
                placeholder="# Privacy Policy&#10;&#10;We respect your data..."
                className="font-mono text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => save(false)}
                disabled={busy}
                className="btn-secondary inline-flex items-center gap-2"
                data-testid="admin-legal-save-draft-btn"
              >
                <Save size={16} /> Save Draft
              </button>
              <button
                onClick={() => save(true)}
                disabled={busy}
                className="btn-primary inline-flex items-center gap-2"
                data-testid="admin-legal-publish-btn"
              >
                <Send size={16} /> Publish
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
