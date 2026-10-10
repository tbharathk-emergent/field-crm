import React from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { LogOut, ChevronRight } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import OfflineIndicator from "@/components/OfflineIndicator";
import TenantLogo from "@/components/TenantLogo";
import { useApp } from "@/context/AppContext";
import { desktopNav, surfaceFor, profilePath } from "@/components/Layout/nav";

const ROLE_LABEL = {
  super_admin: "Super Admin", tenant_admin: "Tenant Admin", manager: "Manager",
  employee: "Employee", dealer: "Dealer", customer: "Customer",
};

/**
 * Desktop web shell shared by every role: fixed sidebar navigation, a top bar
 * and a fluid content area. Rendered only on wide web windows — the role
 * shells (AdminShell / MobileShell) fall back to their mobile layouts on
 * phones, narrow windows and inside the native apps.
 */
export default function DesktopShell() {
  const { user, tenant, t, logout, can, hasFeature } = useApp();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { slug } = useParams();

  const surface = surfaceFor(user?.role);
  const tenantSlug = slug || tenant?.slug;
  const isPlatform = surface === "super_admin";
  const myProfile = profilePath(user?.role, tenantSlug);
  const items = desktopNav(surface, { slug: tenantSlug, tenant })
    .filter((i) => i.heading || ((!i.perm || can(i.perm, "read")) && (!i.feature || hasFeature(i.feature))))
    // drop a heading that has no visible item under it
    .filter((i, idx, all) => !i.heading || (all[idx + 1] && !all[idx + 1].heading));

  const labelOf = (i) => (i.key ? t(i.key) : i.label);
  const brand = isPlatform ? "FieldCRM" : tenant?.name || "FieldCRM";
  // Longest matching link is the page we are on (so /shop does not win over /shop/cart).
  const active = items
    .filter((i) => i.to && (pathname === i.to || (!i.end && pathname.startsWith(`${i.to}/`))))
    .sort((a, b) => b.to.length - a.to.length)[0];

  const onLogout = () => { logout(); navigate("/"); };
  const roleLabel = ROLE_LABEL[user?.role] || "";
  const identity = (
    <>
      <div className="w-9 h-9 rounded-full bg-brand-primary/10 text-brand-primary font-display font-semibold flex items-center justify-center shrink-0">
        {user?.name?.[0]?.toUpperCase() || "U"}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-brand-ink truncate">{user?.name}</div>
        <div className="text-xs text-brand-mute truncate">{user?.phone}</div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-brand-bg" data-shell="desktop">
      <aside className="w-64 shrink-0 flex flex-col bg-white border-r border-brand-line sticky top-0 h-screen">
        <div className="h-16 px-5 border-b border-brand-line flex items-center gap-3">
          {isPlatform ? (
            <div className="w-10 h-10 rounded-xl bg-brand-primary flex items-center justify-center text-white font-display font-bold">FC</div>
          ) : (
            <TenantLogo tenant={tenant} size={40} />
          )}
          <div className="min-w-0">
            <div className="font-display font-semibold text-brand-ink truncate">{brand}</div>
            <div className="text-xs text-brand-mute truncate">{roleLabel}</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto" data-testid="side-nav">
          {items.map((it) => {
            if (it.heading) {
              return <div key={`h-${it.heading}`} className="label-up px-3 pt-4 pb-1 text-[11px]">{it.heading}</div>;
            }
            const Icon = it.icon;
            const label = labelOf(it);
            return (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                data-testid={`nav-${it.key || label.toLowerCase().replace(/[^\w]+/g, "-")}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition ${
                    isActive ? "bg-brand-primary text-white shadow-sm" : "text-brand-ink hover:bg-brand-bg"
                  }`
                }
              >
                <Icon size={18} className="shrink-0" />
                <span className="truncate">{label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-3 border-t border-brand-line">
          {myProfile ? (
            <Link to={myProfile} data-testid="sidebar-profile-link" title={t("profile")}
                  className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-brand-bg">
              {identity}
            </Link>
          ) : (
            <div className="flex items-center gap-3 px-2 py-2">{identity}</div>
          )}
          <button
            data-testid="logout-btn"
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-brand-ink hover:bg-brand-bg"
          >
            <LogOut size={16} /> {t("logout")}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 bg-white/85 backdrop-blur border-b border-brand-line">
          <div className="h-full px-6 xl:px-8 flex items-center gap-4 justify-between">
            <div className="flex items-center gap-2 text-sm min-w-0" data-testid="breadcrumb">
              <span className="text-brand-mute truncate">{brand}</span>
              {active && (
                <>
                  <ChevronRight size={14} className="text-brand-mute shrink-0" />
                  <span className="font-medium text-brand-ink truncate">{labelOf(active)}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <OfflineIndicator />
              <LanguageSwitcher compact />
              <div className="hidden xl:block text-right leading-tight">
                <div className="text-sm font-medium text-brand-ink">{user?.name}</div>
                <div className="text-xs text-brand-mute">{roleLabel}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1">
          <div className="w-full max-w-[1680px] mx-auto px-6 xl:px-8 py-6 animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
