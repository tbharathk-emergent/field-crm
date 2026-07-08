import React, { useState } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import {
  LayoutDashboard, Users, Store, Package, ShoppingBag, MessageSquare, BarChart3,
  Palette, Megaphone, MapPin, Globe, Shield, Target as TargetIcon, CalendarDays,
  Menu, LogOut, Building2, Tag, Settings,
} from "lucide-react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import OfflineIndicator from "@/components/OfflineIndicator";
import TenantLogo from "@/components/TenantLogo";
import { useApp, getLabel } from "@/context/AppContext";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";

function buildNav(role, slug, tenant) {
  if (role === "super_admin") {
    return {
      bottom: [
        { to: "/super-admin", icon: LayoutDashboard, label: "Home", end: true, key: "home" },
        { to: "/super-admin/tenants", icon: Building2, label: "Tenants", key: "tenants" },
        { to: "/super-admin/plans", icon: Tag, label: "Plans", key: "plans" },
        { to: "/super-admin/settings", icon: Settings, label: "Settings", key: "settings" },
      ],
      more: [],
    };
  }
  if (role === "manager") {
    return {
      bottom: [
        { to: `/t/${slug}/manager`, icon: LayoutDashboard, label: "Home", end: true, key: "home" },
        { to: `/t/${slug}/manager/team`, icon: Users, label: "Team", key: "team" },
        { to: `/t/${slug}/manager/map`, icon: MapPin, label: "GPS", key: "gps" },
        { to: `/t/${slug}/manager/leaves`, icon: CalendarDays, label: "Leaves", key: "leaves" },
      ],
      more: [
        { to: `/t/${slug}/manager/targets`, icon: TargetIcon, label: "Targets" },
        { to: `/t/${slug}/manager/reports`, icon: BarChart3, label: "Reports" },
      ],
    };
  }
  // tenant_admin
  return {
    bottom: [
      { to: `/t/${slug}/admin`, icon: LayoutDashboard, label: "Home", end: true, key: "home" },
      { to: `/t/${slug}/admin/employees`, icon: Users, label: "Team", key: "team" },
      { to: `/t/${slug}/admin/dealers`, icon: Store, label: getLabel(tenant, "dealer_plural", "Dealers").split(" ")[0], key: "dealers" },
      { to: `/t/${slug}/admin/orders`, icon: ShoppingBag, label: "Orders", key: "orders" },
    ],
    more: [
      { to: `/t/${slug}/admin/branding`, icon: Palette, label: "Branding" },
      { to: `/t/${slug}/admin/areas`, icon: Globe, label: "Areas" },
      { to: `/t/${slug}/admin/roles`, icon: Shield, label: "Roles & Permissions" },
      { to: `/t/${slug}/admin/products`, icon: Package, label: getLabel(tenant, "product_plural", "Products") },
      { to: `/t/${slug}/admin/targets`, icon: TargetIcon, label: "Sales Targets" },
      { to: `/t/${slug}/admin/leaves`, icon: CalendarDays, label: "Leaves" },
      { to: `/t/${slug}/admin/enquiries`, icon: MessageSquare, label: "Enquiries" },
      { to: `/t/${slug}/admin/reports`, icon: BarChart3, label: "Reports" },
      { to: `/t/${slug}/admin/announcements`, icon: Megaphone, label: "Announcements" },
    ],
  };
}

export default function MobileAdminShell({ role }) {
  const { user, tenant, t, logout } = useApp();
  const navigate = useNavigate();
  const { slug } = useParams();
  const [sheetOpen, setSheetOpen] = useState(false);

  const { bottom, more } = buildNav(role, slug || tenant?.slug, tenant);

  const onLogout = () => { logout(); navigate("/"); };
  const goto = (to) => { setSheetOpen(false); navigate(to); };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-brand-line">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3 justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {role === "super_admin" ? (
              <div className="w-9 h-9 rounded-xl bg-brand-primary flex items-center justify-center text-white font-display font-bold text-sm">FC</div>
            ) : (
              <TenantLogo tenant={tenant} size={36} />
            )}
            <div className="min-w-0">
              <div className="font-display font-semibold text-brand-ink truncate text-sm leading-tight">
                {role === "super_admin" ? "FieldCRM" : tenant?.name || "Tenant"}
              </div>
              <div className="text-[11px] text-brand-mute truncate capitalize">
                {role.replace("_", " ")} · {user?.name}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <OfflineIndicator />
            <LanguageSwitcher compact />
            <button data-testid="logout-btn" onClick={onLogout}
                    aria-label="logout"
                    className="p-2 rounded-full text-brand-mute hover:bg-brand-bg">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 pb-24 animate-fade-up">
        <div className="max-w-2xl mx-auto p-4">
          <Outlet />
        </div>
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-brand-line z-40 shadow-[0_-2px_10px_rgba(0,0,0,0.04)]">
        <div className="max-w-2xl mx-auto grid grid-cols-5">
          {bottom.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                data-testid={`tab-${item.key}`}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                    isActive ? "text-brand-primary" : "text-brand-mute"
                  }`
                }
              >
                <Icon size={20} />
                <span className="truncate max-w-[64px]">{item.label}</span>
              </NavLink>
            );
          })}

          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button data-testid="tab-more"
                className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-brand-mute">
                <Menu size={20} />
                <span>More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-3xl">
              <SheetHeader className="text-left">
                <SheetTitle className="font-display">More Options</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-3 pt-4">
                {more.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.to}
                      data-testid={`more-${item.label.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')}`}
                      onClick={() => goto(item.to)}
                      className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-brand-line hover:bg-brand-bg active:scale-95 transition"
                    >
                      <div className="w-10 h-10 rounded-xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
                        <Icon size={20} />
                      </div>
                      <span className="text-xs font-medium text-brand-ink text-center leading-tight">{item.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-6 pt-4 border-t border-brand-line">
                <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-brand-line text-brand-error">
                  <LogOut size={16} /> {t("logout")}
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </div>
  );
}
