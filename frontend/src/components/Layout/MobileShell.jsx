import React from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { Home, ShoppingCart, ClipboardList, User, Bell, LogOut } from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import TenantLogo from "@/components/TenantLogo";
import { useApp } from "@/context/AppContext";

export default function MobileShell({ variant = "employee" }) {
  const { tenant, user, t, logout } = useApp();
  const navigate = useNavigate();
  const { slug } = useParams();
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

  const onLogout = () => { logout(); navigate("/"); };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-brand-line safe-pt">
        <div className="px-4 py-3 flex items-center gap-3 justify-between">
          <div className="flex items-center gap-2 min-w-0">
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

      <main className="flex-1 pb-20 animate-fade-up">
        <div className="max-w-xl mx-auto p-4">
          <Outlet />
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-brand-line z-40 safe-pb">
        <div className="max-w-xl mx-auto grid grid-cols-5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                data-testid={`tab-${tab.key}`}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                    isActive ? "text-brand-primary" : "text-brand-mute"
                  }`
                }
              >
                <Icon size={20} />
                <span className="truncate">{tab.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
