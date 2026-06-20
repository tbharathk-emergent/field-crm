import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Sprout, Truck, Building2, Stethoscope, HardHat, ChevronRight } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";

export default function Landing() {
  const { user, t, logout } = useApp();
  const navigate = useNavigate();
  const [tenantSlug, setTenantSlug] = useState("demo");
  const [creds, setCreds] = useState(null);

  useEffect(() => {
    api.get("/public/demo-credentials").then((r) => setCreds(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      if (user.role === "super_admin") navigate("/super-admin");
      else if (user.tenant_id) {
        const slug = JSON.parse(localStorage.getItem("fc_tenant") || "{}").slug;
        if (!slug) return;
        if (user.role === "tenant_admin") navigate(`/t/${slug}/admin`);
        else if (user.role === "manager") navigate(`/t/${slug}/manager`);
        else if (user.role === "customer") navigate(`/t/${slug}/shop`);
        else navigate(`/t/${slug}/app`);
      }
    }
  }, [user, navigate]);

  const goTenant = (e) => {
    e.preventDefault();
    if (tenantSlug.trim()) navigate(`/t/${tenantSlug.trim().toLowerCase()}`);
  };

  return (
    <div className="min-h-screen bg-brand-bg">
      <header className="px-4 sm:px-8 py-5 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-brand-primary flex items-center justify-center text-white font-display font-bold text-lg">FC</div>
          <div>
            <div className="font-display text-xl font-bold tracking-tight">FieldCRM</div>
            <div className="text-xs text-brand-mute">localappstore.in</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          {user && (
            <button onClick={logout} className="text-sm text-brand-mute hover:text-brand-ink px-3 py-1.5">
              {t("logout")}
            </button>
          )}
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-4 sm:px-8 py-10 sm:py-16 grid lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-secondary/10 text-brand-secondary text-xs font-semibold tracking-wider uppercase">
            Multi-Tenant SaaS · White-Label PWA
          </span>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-brand-ink leading-[1.05]">
            {t("landing_title")} for the
            <span className="block text-brand-primary">Field, simplified.</span>
          </h1>
          <p className="text-base sm:text-lg text-brand-mute leading-relaxed max-w-xl">
            {t("landing_sub")} Configure your branding, labels, and team in minutes — give every dealer and employee a phone-first PWA with offline-friendly entries, GPS check-ins, and order workflows.
          </p>

          <form onSubmit={goTenant} className="card-surface p-4 sm:p-5 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center max-w-xl">
            <div className="flex-1">
              <label className="label-up block mb-1">{t("enter_tenant")}</label>
              <div className="flex items-center bg-brand-bg rounded-lg px-3 py-2 border border-brand-line">
                <span className="text-brand-mute text-sm pr-1">localappstore.in/t/</span>
                <input
                  data-testid="tenant-slug-input"
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value)}
                  placeholder={t("tenant_placeholder")}
                  className="bg-transparent flex-1 outline-none text-sm"
                />
              </div>
            </div>
            <button
              data-testid="open-tenant-btn"
              type="submit"
              className="btn-primary whitespace-nowrap"
            >
              {t("continue")} <ArrowRight size={16} />
            </button>
          </form>

          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              to="/login"
              data-testid="super-admin-shortcut"
              className="text-sm text-brand-mute hover:text-brand-primary underline-offset-4 hover:underline"
            >
              {t("super_admin")} Login →
            </Link>
            <span className="text-brand-mute text-sm">·</span>
            <Link
              to="/t/demo"
              data-testid="demo-tenant-link"
              className="text-sm text-brand-primary font-semibold"
            >
              Try Demo Tenant (Akshara Agro) →
            </Link>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/10 via-brand-secondary/5 to-transparent rounded-3xl -z-10 blur-2xl" />
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: Sprout, title: "Agriculture", desc: "Farmer enquiries, crop visits" },
              { icon: Truck, title: "FMCG", desc: "Dealer orders, route plans" },
              { icon: Stethoscope, title: "Pharma", desc: "DCR, samples, MR coverage" },
              { icon: HardHat, title: "Manufacturing", desc: "Service tickets, B2B" },
            ].map((c, i) => {
              const Icon = c.icon;
              return (
                <div key={c.title} className="card-surface p-5 hover:shadow-md transition-shadow" style={{ animationDelay: `${i * 80}ms` }}>
                  <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-3">
                    <Icon size={20} />
                  </div>
                  <div className="font-display font-semibold text-brand-ink">{c.title}</div>
                  <div className="text-xs text-brand-mute mt-1">{c.desc}</div>
                </div>
              );
            })}
          </div>

          {creds && (
            <div className="card-surface p-5 mt-5">
              <div className="label-up mb-3">Quick Access</div>
              <div className="space-y-2">
                <Link to="/login" className="flex items-center justify-between p-3 rounded-xl border border-brand-line hover:bg-brand-bg transition group">
                  <div>
                    <div className="font-medium text-sm">{t("super_admin")}</div>
                    <div className="text-xs text-brand-mute">{creds.super_admin.phone}</div>
                  </div>
                  <ChevronRight size={18} className="text-brand-mute group-hover:text-brand-primary" />
                </Link>
                <Link to="/t/demo" className="flex items-center justify-between p-3 rounded-xl border border-brand-line hover:bg-brand-bg transition group">
                  <div>
                    <div className="font-medium text-sm">Demo Tenant Users</div>
                    <div className="text-xs text-brand-mute">{creds.users.length} demo accounts ready</div>
                  </div>
                  <ChevronRight size={18} className="text-brand-mute group-hover:text-brand-primary" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className="border-t border-brand-line bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 flex flex-col sm:flex-row gap-3 items-center justify-between text-xs text-brand-mute">
          <div>© FieldCRM · localappstore.in · Multi-tenant Field Force Platform</div>
          <div>White-label PWA · {creds ? `${creds.users.length} demo accounts available` : "Loading..."}</div>
        </div>
      </footer>
    </div>
  );
}
