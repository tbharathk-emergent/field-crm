import React from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import {
  LayoutDashboard, Building2, Tag, Settings, Cloud, LogOut, Users, Store, Package,
  ShoppingBag, MessageSquare, BarChart3, Palette, Megaphone, MapPin,
  Globe, Shield, Target as TargetIcon, CalendarDays,
} from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import OfflineIndicator from "@/components/OfflineIndicator";
import TenantLogo from "@/components/TenantLogo";
import { useApp, getLabel } from "@/context/AppContext";

const NAV = {
  super_admin: [
    { to: "/super-admin", icon: LayoutDashboard, key: "dashboard", end: true },
    { to: "/super-admin/tenants", icon: Building2, key: "tenants" },
    { to: "/super-admin/plans", icon: Tag, key: "plans" },
    { to: "/super-admin/cloud", icon: Cloud, label: "Cloud" },
    { to: "/super-admin/settings", icon: Settings, key: "settings" },
  ],
  tenant_admin: (slug, tenant) => [
    { to: `/t/${slug}/admin`, icon: LayoutDashboard, key: "dashboard", end: true },
    { to: `/t/${slug}/admin/branding`, icon: Palette, key: "branding" },
    { to: `/t/${slug}/admin/areas`, icon: Globe, label: "Areas" },
    { to: `/t/${slug}/admin/roles`, icon: Shield, label: "Roles" },
    { to: `/t/${slug}/admin/employees`, icon: Users, key: "employees" },
    { to: `/t/${slug}/admin/dealers`, icon: Store, label: getLabel(tenant, "dealer_plural", "Dealers") },
    { to: `/t/${slug}/admin/customers`, icon: Users, label: getLabel(tenant, "customer_plural", "Customers") },
    { to: `/t/${slug}/admin/products`, icon: Package, label: getLabel(tenant, "product_plural", "Products") },
    { to: `/t/${slug}/admin/targets`, icon: TargetIcon, label: "Targets" },
    { to: `/t/${slug}/admin/leaves`, icon: CalendarDays, label: "Leaves" },
    { to: `/t/${slug}/admin/orders`, icon: ShoppingBag, key: "orders" },
    { to: `/t/${slug}/admin/enquiries`, icon: MessageSquare, key: "enquiries" },
    { to: `/t/${slug}/admin/reports`, icon: BarChart3, key: "reports" },
    { to: `/t/${slug}/admin/announcements`, icon: Megaphone, key: "notifications" },
  ],
  manager: (slug) => [
    { to: `/t/${slug}/manager`, icon: LayoutDashboard, key: "dashboard", end: true },
    { to: `/t/${slug}/manager/team`, icon: Users, key: "employees" },
    { to: `/t/${slug}/manager/map`, icon: MapPin, label: "GPS" },
    { to: `/t/${slug}/manager/targets`, icon: TargetIcon, label: "Targets" },
    { to: `/t/${slug}/manager/leaves`, icon: CalendarDays, label: "Leaves" },
    { to: `/t/${slug}/manager/reports`, icon: BarChart3, key: "reports" },
  ],
};

export default function AdminShell({ role }) {
  const { user, tenant, t, logout } = useApp();
  const navigate = useNavigate();
  const { slug } = useParams();
  const items = role === "super_admin" ? NAV.super_admin
    : role === "manager" ? NAV.manager(slug || tenant?.slug)
    : NAV.tenant_admin(slug || tenant?.slug, tenant);

  const onLogout = () => { logout(); navigate("/"); };

  return (
    <div className="min-h-screen flex bg-brand-bg">
      <aside className="hidden lg:flex w-64 flex-col bg-white border-r border-brand-line sticky top-0 h-screen">
        <div className="p-5 border-b border-brand-line flex items-center gap-3">
          {role === "super_admin" ? (
            <div className="w-10 h-10 rounded-xl bg-brand-primary flex items-center justify-center text-white font-display font-bold">FC</div>
          ) : (
            <TenantLogo tenant={tenant} size={40} />
          )}
          <div className="min-w-0">
            <div className="font-display font-semibold text-brand-ink truncate">
              {role === "super_admin" ? "FieldCRM" : tenant?.name || "Tenant"}
            </div>
            <div className="text-xs text-brand-mute capitalize">{role.replace("_", " ")}</div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                data-testid={`nav-${it.key || it.label?.toLowerCase().replace(/\s/g, '-')}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                    isActive
                      ? "bg-brand-primary text-white shadow-sm"
                      : "text-brand-ink hover:bg-brand-bg"
                  }`
                }
              >
                <Icon size={18} />
                <span>{it.key ? t(it.key) : it.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-brand-line">
          <div className="text-xs text-brand-mute px-3 mb-2">{user?.name} • {user?.phone}</div>
          <button
            data-testid="logout-btn"
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-brand-ink hover:bg-brand-bg"
          >
            <LogOut size={16} /> {t("logout")}
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b border-brand-line">
          <div className="px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-3 justify-between">
            <div className="lg:hidden flex items-center gap-3">
              <TenantLogo tenant={tenant} size={32} />
              <span className="font-display font-semibold">{tenant?.name || "FieldCRM"}</span>
            </div>
            <div className="hidden lg:block text-sm text-brand-mute">
              {t("welcome")}, <span className="text-brand-ink font-medium">{user?.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <OfflineIndicator />
              <LanguageSwitcher compact />
              <button
                data-testid="logout-mobile-btn"
                onClick={onLogout}
                className="lg:hidden inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-brand-line text-sm"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </header>
        <div className="px-4 sm:px-6 lg:px-8 py-6 animate-fade-up">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
