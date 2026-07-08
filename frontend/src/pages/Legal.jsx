import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";

/**
 * Public legal page — /legal/:kind and /t/:slug/legal/:kind
 *
 * Resolves the tenant via (in order):
 *   1. `:slug` in the URL, if present
 *   2. cached tenant slug in localStorage (fc_tenant_slug)
 *   3. host header on the backend (custom_domain / subdomain)
 *
 * Renders the content_md as plain preformatted text — a tiny fallback that
 * keeps the App Store reviewer happy even before any tenant publishes docs.
 */
const KIND_TITLES = {
  privacy: "Privacy Policy",
  terms: "Terms of Service",
  refund: "Refund Policy",
  shipping: "Shipping Policy",
  about: "About Us",
  contact: "Contact Us",
};

export default function LegalPage() {
  const { kind, slug } = useParams();
  const [state, setState] = useState({ loading: true, doc: null, error: null });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const params = {};
        if (slug) params.slug = slug;
        const res = await api.get(`/public/legal/${kind}`, { params });
        if (!cancelled) setState({ loading: false, doc: res.data, error: null });
      } catch (err) {
        if (cancelled) return;
        const code = err?.response?.data?.detail?.code;
        setState({ loading: false, doc: null, error: code || "unknown" });
      }
    };
    load();
    return () => { cancelled = true; };
  }, [kind, slug]);

  const title = KIND_TITLES[kind] || (kind ? kind.replace(/-/g, " ") : "Legal");

  return (
    <div className="min-h-screen bg-white" data-testid={`legal-page-${kind}`}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <Link to="/" className="text-sm text-brand-mute hover:underline" data-testid="legal-back-link">
            ← Back
          </Link>
          <div className="text-xs uppercase tracking-widest text-brand-mute">Legal</div>
        </div>

        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-6" data-testid="legal-title">
          {state.doc?.title || title}
        </h1>

        {state.loading && (
          <div className="text-brand-mute" data-testid="legal-loading">Loading…</div>
        )}

        {!state.loading && state.doc && (
          <article
            className="prose prose-sm max-w-none whitespace-pre-wrap font-mono text-sm leading-relaxed border border-brand-line rounded-2xl p-5 bg-neutral-50"
            data-testid="legal-content"
          >
            {state.doc.content_md}
          </article>
        )}

        {!state.loading && !state.doc && (
          <div
            className="border border-dashed border-brand-line rounded-2xl p-6 text-sm text-brand-mute"
            data-testid="legal-empty"
          >
            <p className="mb-2">
              This tenant has not published a <strong>{title}</strong> document yet.
            </p>
            <p className="text-xs">
              If you are the tenant administrator, publish one from{" "}
              <em>Admin → Settings → Legal Documents</em>. The App Store / Play
              Store require these documents before submission.
            </p>
          </div>
        )}

        {state.doc?.published_at && (
          <div className="mt-4 text-xs text-brand-mute" data-testid="legal-published-at">
            Last updated: {new Date(state.doc.published_at).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}
