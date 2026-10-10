import React from "react";
import DesktopShell from "@/components/Layout/DesktopShell";
import MobileAdminShell from "@/components/Layout/MobileAdminShell";
import { useIsDesktop } from "@/lib/platform";

/**
 * Shell for the super admin, tenant admin and manager surfaces: the sidebar
 * desktop shell on wide web windows, the bottom-nav shell on phones, narrow
 * windows and inside the native apps.
 */
export default function AdminShell({ role }) {
  const isDesktop = useIsDesktop();
  return isDesktop ? <DesktopShell /> : <MobileAdminShell role={role} />;
}
