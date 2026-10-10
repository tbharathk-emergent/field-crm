import React from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { Home, ShoppingCart, ClipboardList, User, Bell, LogOut, ArrowLeft } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import TenantLogo from "@/components/TenantLogo";
import DesktopShell from "@/components/Layout/DesktopShell";
import { useApp } from "@/context/AppContext";
import { useIsDesktop } from "@/lib/platform";

/**
 * Shell for the employee app and the customer/dealer shop: the sidebar desktop
 * shell on wide web windows, the bottom-nav app shell on phones, narrow
 * windows and inside the native apps.
 */
export default function MobileShell({ variant = "employee" }) {
  const { tenant, user, t, logout } = useApp();
  const navigate = useNavigate();
  const { slug } = useParams();
  const isDesktop = useIsDesktop();

  if (isDesktop) return <DesktopShell />;

  const base = variant === "customer" ? `/t/${slug}/shop` : `/t/${slug}/app`;

  const tabs = variant === "customer"
    ? [
        { to: base, icon: Home, label: t("home"), end: true, key: "home" },
        { to: `${base}/catalogue`, icon: ClipboardList, label: t("catalogue"), key: "catalogue" },
        { to: `${base}/cart`, icon: ShoppingCart, label: t("cart"), key: "cart" },
        { to: `${base}/orders`, icon: Bell, label: t("orders"), key: "orders" },
        { to: `${base}/account`, icon: User, label: t("account"), key: "account" },
      ]
    : [
        { to: base, icon: Home, label: t("home"), end: true, key: "home" },
        { to: `${base}/dealers`, icon: ClipboardList, label: t("my_dealers"), key: "dealers" },
        { to: `${base}/catalogue`, icon: ShoppingCart, label: t("catalogue"), key: "catalogue" },
        { to: `${base}/notifications`, icon: Bell, label: t("notifications"), key: "notifications" },
        { to: `${base}/profile`, icon: User, label: t("profile"), key: "profile" },
      ];

  // Managers and admins reach the field-entry screens from their own dashboard.
  const dashboard = variant === "employee" && user?.role === "manager" ? `/t/${slug}/manager`
    : variant === "employee" && user?.role === "tenant_admin" ? `/t/${slug}/admin`
    : null;

  const onLogout = () => { logout(); navigate("/"); };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-brand-line safe-pt">
        <div className="px-4 md:px-6 py-3 flex items-center gap-3 justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {dashboard && (
              <button
                data-testid="back-to-dashboard-btn"
                onClick={() => navigate(dashboard)}
                aria-label="Back to dashboard"
                className="p-2 -ml-2 rounded-full text-brand-mute hover:bg-brand-bg"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <TenantLogo tenant={tenant} size={36} />
            <div className="min-w-0">
              <div className="font-display font-semibold text-brand-ink truncate text-sm">
                {tenant?.name || "FieldCRM"}
              </div>
              <div className="text-[11px] text-brand-mute truncate">{user?.name}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <LanguageSwitcher compact />
            <button
              data-testid="mobile-logout-btn"
              onClick={onLogout}
              aria-label="logout"
              className="p-2 rounded-full text-brand-mute hover:bg-brand-bg"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Phones get a comfortable reading column; tablets use the full width. */}
      <main className="flex-1 pb-bottom-nav animate-fade-up">
        <div className="max-w-xl md:max-w-none mx-auto p-4 md:p-6">
          <Outlet />
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-brand-line z-40 safe-pb">
        <div className="max-w-xl md:max-w-2xl mx-auto flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                data-testid={`tab-${tab.key}`}
                className={({ isActive }) =>
                  `flex-1 min-w-0 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                    isActive ? "text-brand-primary" : "text-brand-mute"
                  }`
                }
              >
                <Icon size={20} />
                <span className="truncate max-w-full px-1">{tab.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
