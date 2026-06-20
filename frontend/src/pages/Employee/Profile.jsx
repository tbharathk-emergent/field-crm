import React from "react";
import { useApp } from "@/context/AppContext";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const { user, tenant, t, logout } = useApp();
  const navigate = useNavigate();
  return (
    <div className="space-y-3">
      <h1 className="font-display text-xl font-bold">{t("profile")}</h1>
      <div className="card-surface p-5 text-center">
        <div className="w-20 h-20 rounded-full mx-auto bg-brand-primary text-white font-display text-2xl font-bold flex items-center justify-center">
          {user?.name?.[0] || "U"}
        </div>
        <div className="font-display font-semibold mt-3">{user?.name}</div>
        <div className="text-xs text-brand-mute">{user?.phone} · {user?.role}</div>
        <div className="text-xs text-brand-mute">{tenant?.name}</div>
      </div>
      <div className="card-surface p-4 space-y-2">
        <div className="flex justify-between text-sm"><span className="text-brand-mute">Employee Code</span><span className="font-medium">{user?.employee_code || "—"}</span></div>
        <div className="flex justify-between text-sm"><span className="text-brand-mute">Area</span><span className="font-medium">{user?.area || "—"}</span></div>
        <div className="flex justify-between text-sm"><span className="text-brand-mute">Email</span><span className="font-medium">{user?.email || "—"}</span></div>
      </div>
      <button onClick={() => { logout(); navigate("/"); }} className="btn-secondary w-full">
        <LogOut size={16} /> {t("logout")}
      </button>
    </div>
  );
}
