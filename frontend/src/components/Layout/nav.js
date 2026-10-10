/* Sidebar navigation for the desktop web shell, one list per surface.
 *
 * Item shape: { to, icon, key | label, end?, perm?, feature? } or { heading }.
 * `key` is an i18n key; `perm` / `feature` gate the item the same way the
 * mobile shells do.
 */
import {
  LayoutDashboard, Building2, Tag, Settings, Cloud, Users, Store, Package,
  ShoppingBag, MessageSquare, BarChart3, Palette, Megaphone, MapPin,
  Globe, Shield, Target as TargetIcon, CalendarDays, SlidersHorizontal, Leaf, FileText,
  Home, ShoppingCart, ClipboardList, User, Bell, Wallet, Sprout, Receipt,
} from "lucide-react";
import { getLabel } from "@/context/AppContext";

const fieldEntry = (slug, tenant) => {
  const base = `/t/${slug}/app`;
  return [
    { to: `${base}/dealers`, icon: Store, label: getLabel(tenant, "dealer_plural", "Dealers"), perm: "dealers" },
    { to: `${base}/customers`, icon: Sprout, label: getLabel(tenant, "customer_plural", "Customers"), perm: "customers" },
    { to: `${base}/visit`, icon: FileText, key: "visit_report", perm: "visits" },
    { to: `${base}/collection`, icon: Wallet, key: "collection_entry", perm: "collections" },
    { to: `${base}/sales`, icon: ShoppingCart, key: "sales_entry", perm: "sales" },
    { to: `${base}/dcr`, icon: ClipboardList, key: "dcr", perm: "dcr" },
    { to: `${base}/enquiry`, icon: MessageSquare, label: `${getLabel(tenant, "customer", "Customer")} Enquiry`, perm: "enquiries" },
  ];
};

/** Which sidebar a signed-in user gets. It follows the person, not the page,
 *  so a manager opening a field-entry screen keeps the manager navigation. */
export function surfaceFor(role) {
  if (role === "super_admin" || role === "tenant_admin" || role === "manager" || role === "employee") return role;
  return "customer"; // customer + dealer share the shop
}

/** Where "my profile / my account" lives for a role (null for the platform owner). */
export function profilePath(role, slug) {
  if (role === "super_admin" || !slug) return null;
  return role === "customer" || role === "dealer" ? `/t/${slug}/shop/account` : `/t/${slug}/app/profile`;
}

export function desktopNav(surface, { slug, tenant }) {
  switch (surface) {
    case "super_admin":
      return [
        { to: "/super-admin", icon: LayoutDashboard, key: "dashboard", end: true },
        { to: "/super-admin/tenants", icon: Building2, key: "tenants" },
        { to: "/super-admin/plans", icon: Tag, key: "plans" },
        { to: "/super-admin/cloud", icon: Cloud, label: "Cloud" },
        { to: "/super-admin/settings", icon: Settings, key: "settings" },
      ];

    case "manager": {
      const base = `/t/${slug}/manager`;
      return [
        { to: base, icon: LayoutDashboard, key: "dashboard", end: true },
        { to: `${base}/team`, icon: Users, label: "Team", perm: "employees" },
        { to: `${base}/map`, icon: MapPin, label: "GPS Tracking", perm: "gps" },
        { to: `${base}/targets`, icon: TargetIcon, label: "Targets", perm: "targets" },
        { to: `${base}/leaves`, icon: CalendarDays, label: "Leaves", perm: "leaves" },
        { to: `${base}/reports`, icon: BarChart3, key: "reports", perm: "reports" },
        { to: `${base}/advisor`, icon: Leaf, label: "Crop Advisor", feature: "crop_advisor" },
        { heading: "Field entry" },
        ...fieldEntry(slug, tenant),
        { to: `/t/${slug}/app/catalogue`, icon: Package, key: "catalogue", perm: "products" },
        { heading: "Account" },
        { to: `/t/${slug}/app/profile`, icon: User, key: "profile" },
      ];
    }

    case "employee": {
      const base = `/t/${slug}/app`;
      return [
        { to: base, icon: Home, key: "home", end: true },
        { heading: "Field work" },
        ...fieldEntry(slug, tenant),
        { heading: "Resources" },
        { to: `${base}/catalogue`, icon: Package, key: "catalogue", perm: "products" },
        { to: `${base}/leaves`, icon: CalendarDays, label: "Leaves", perm: "leaves" },
        { to: `${base}/notifications`, icon: Bell, key: "notifications" },
        { to: `${base}/advisor`, icon: Leaf, label: "Crop Advisor", feature: "crop_advisor" },
        { to: `${base}/profile`, icon: User, key: "profile" },
      ];
    }

    case "customer": {
      const base = `/t/${slug}/shop`;
      return [
        { to: base, icon: Home, key: "home", end: true },
        { to: `${base}/catalogue`, icon: Package, key: "catalogue" },
        { to: `${base}/cart`, icon: ShoppingCart, key: "cart" },
        { to: `${base}/orders`, icon: Receipt, key: "orders" },
        { to: `${base}/advisor`, icon: Leaf, label: "Crop Advisor", feature: "crop_advisor" },
        { to: `${base}/account`, icon: User, key: "account" },
      ];
    }

    default: {
      // tenant_admin
      const base = `/t/${slug}/admin`;
      return [
        { to: base, icon: LayoutDashboard, key: "dashboard", end: true },
        { heading: "People" },
        { to: `${base}/employees`, icon: Users, key: "employees", perm: "employees" },
        { to: `${base}/dealers`, icon: Store, label: getLabel(tenant, "dealer_plural", "Dealers"), perm: "dealers" },
        { to: `${base}/customers`, icon: Sprout, label: getLabel(tenant, "customer_plural", "Customers"), perm: "customers" },
        { to: `${base}/roles`, icon: Shield, label: "Roles & Permissions", perm: "roles" },
        { heading: "Operations" },
        { to: `${base}/orders`, icon: ShoppingBag, key: "orders", perm: "orders" },
        { to: `${base}/enquiries`, icon: MessageSquare, key: "enquiries", perm: "enquiries" },
        { to: `${base}/targets`, icon: TargetIcon, label: "Sales Targets", perm: "targets" },
        { to: `${base}/leaves`, icon: CalendarDays, label: "Leaves", perm: "leaves" },
        { to: `${base}/reports`, icon: BarChart3, key: "reports", perm: "reports" },
        { to: `${base}/announcements`, icon: Megaphone, label: "Announcements", perm: "announcements" },
        { heading: "Catalogue" },
        { to: `${base}/products`, icon: Package, label: getLabel(tenant, "product_plural", "Products"), perm: "products" },
        { to: `${base}/advisor`, icon: Leaf, label: "Crop Advisor", feature: "crop_advisor" },
        { heading: "Setup" },
        { to: `${base}/branding`, icon: Palette, key: "branding", perm: "branding" },
        { to: `${base}/areas`, icon: Globe, label: "Areas", perm: "areas" },
        { to: `${base}/custom-fields`, icon: SlidersHorizontal, label: "Custom Fields", perm: "branding" },
        { to: `${base}/legal`, icon: FileText, label: "Legal Documents", perm: "branding" },
        { heading: "Account" },
        { to: `/t/${slug}/app/profile`, icon: User, key: "profile" },
      ];
    }
  }
}
