import React from "react";
import { fileUrl } from "@/lib/api";

export default function TenantLogo({ tenant, size = 40, className = "" }) {
  const initials = (tenant?.name || "FC")
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  if (tenant?.logo_path) {
    return (
      <img
        src={fileUrl(tenant.logo_path)}
        alt={tenant.name}
        style={{ width: size, height: size }}
        className={`rounded-xl object-cover ${className}`}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, background: "var(--brand-primary)" }}
      className={`rounded-xl flex items-center justify-center text-white font-display font-bold ${className}`}
    >
      <span style={{ fontSize: size * 0.4 }}>{initials}</span>
    </div>
  );
}
