import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { renderMarkdown } from "@/lib/markdown";

/**
 * Public legal page — /legal/:kind and /t/:slug/legal/:kind
 *
 * Resolution order (backend-driven):
 *   1. `:slug` in the URL, if present
 *   2. `X-Tenant-Slug` header (from cached tenant in localStorage)
 *   3. Host header (custom_domain / subdomain resolution)
 *   4. Platform default (renders even with zero tenant context — required
 *      for the marketing landing footer's legal links to work everywhere).
 *
 * Response carries `is_platform_default: True` when we're serving a fallback,
 * so we can show the "your admin can customize this" banner.
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
  const isPlatformDefault = !!state.doc?.is_platform_default;

  return (
    <div className="min-h-screen bg-white" data-testid={`legal-page-${kind}`}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <Link to="/" className="text-sm text-brand-mute hover:underline" data-testid="legal-back-link">
            ← Back
          </Link>
          <div className="text-xs uppercase tracking-widest text-brand-mute">Legal</div>
        </div>

        <h1 className="text-3xl sm:text-4xl font-display font-semibold mb-2" data-testid="legal-title">
          {state.doc?.title || title}
        </h1>

        {isPlatformDefault && (
          <div
            data-testid="legal-platform-default-banner"
            className="mb-5 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs px-3 py-2 leading-relaxed"
          >
            <strong>Platform default:</strong> your organisation has not
            published a custom {title} yet. This template is shown as a
            placeholder — a tenant administrator can override it from
            <em> Admin → Legal Documents</em>.
          </div>
        )}

        {state.loading && (
          <div className="text-brand-mute" data-testid="legal-loading">Loading…</div>
        )}

        {!state.loading && state.doc && (
          <article
            className="legal-prose text-sm leading-relaxed"
            data-testid="legal-content"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(state.doc.content_md || "") }}
          />
        )}

        {!state.loading && !state.doc && (
          <div
            className="border border-dashed border-brand-line rounded-2xl p-6 text-sm text-brand-mute"
            data-testid="legal-empty"
          >
            <p className="mb-2">
              This document could not be loaded.
            </p>
          </div>
        )}

        {state.doc?.published_at && !isPlatformDefault && (
          <div className="mt-6 text-xs text-brand-mute" data-testid="legal-published-at">
            Last updated: {new Date(state.doc.published_at).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}
