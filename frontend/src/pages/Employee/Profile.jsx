import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { LogOut, Trash2, ShieldCheck, FileText } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { PageHeader } from "@/components/Layout/Page";

export default function Profile() {
  const { user, tenant, t, logout } = useApp();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  const deleteAccount = async () => {
    const msg = "Delete your account permanently?\n\nYour profile will be soft-deleted and this session will be signed out.";
    if (!window.confirm(msg)) return;
    setDeleting(true);
    try {
      await api.post("/auth/me/delete");
      toast.success("Account deleted");
      logout();
      navigate("/");
    } catch (e) {
      const d = e?.response?.data?.detail;
      const message = (d && typeof d === "object" && d.message) || d || "Failed to delete";
      toast.error(String(message));
    } finally {
      setDeleting(false);
    }
  };

  const row = (label, value) => (
    <div className="flex justify-between gap-4 text-sm py-2 lg:py-3 border-b border-brand-line last:border-0">
      <span className="text-brand-mute">{label}</span><span className="font-medium text-right">{value || "—"}</span>
    </div>
  );

  return (
    <div className="space-y-3 lg:space-y-5 pb-4">
      <PageHeader title={t("profile")} subtitle={tenant?.name} />

      <div className="grid grid-cols-1 gap-3 xl:gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <div className="space-y-3 xl:space-y-6">
          <div className="card-surface p-5 lg:p-6 text-center lg:text-left lg:flex lg:items-center lg:gap-5">
            <div className="w-20 h-20 rounded-full mx-auto lg:mx-0 shrink-0 bg-brand-primary text-white font-display text-2xl font-bold flex items-center justify-center">
              {user?.name?.[0] || "U"}
            </div>
            <div>
              <div className="font-display font-semibold lg:text-xl mt-3 lg:mt-0">{user?.name}</div>
              <div className="text-xs lg:text-sm text-brand-mute capitalize">{user?.phone} · {(user?.role || "").replace("_", " ")}</div>
              <div className="text-xs lg:text-sm text-brand-mute">{tenant?.name}</div>
            </div>
          </div>

          <div className="card-surface px-4 lg:px-6 py-2">
            {row("Employee Code", user?.employee_code)}
            {row("Area", user?.area)}
            {row("Email", user?.email)}
            {row("Phone", user?.phone)}
          </div>
        </div>

        <div className="space-y-3">
          <div className="card-surface p-4 space-y-3">
            <div className="text-xs text-brand-mute uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck size={14} /> Legal & Support
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Link to={`/t/${tenant?.slug}/legal/privacy`} className="text-brand-primary hover:underline inline-flex items-center gap-1.5" data-testid="legal-privacy-link">
                <FileText size={14} /> Privacy Policy
              </Link>
              <Link to={`/t/${tenant?.slug}/legal/terms`} className="text-brand-primary hover:underline inline-flex items-center gap-1.5" data-testid="legal-terms-link">
                <FileText size={14} /> Terms of Service
              </Link>
              <Link to={`/t/${tenant?.slug}/legal/about`} className="text-brand-primary hover:underline inline-flex items-center gap-1.5" data-testid="legal-about-link">
                <FileText size={14} /> About Us
              </Link>
              <Link to={`/t/${tenant?.slug}/legal/contact`} className="text-brand-primary hover:underline inline-flex items-center gap-1.5" data-testid="legal-contact-link">
                <FileText size={14} /> Contact Us
              </Link>
            </div>
          </div>

          <button onClick={() => { logout(); navigate("/"); }} className="btn-secondary w-full" data-testid="profile-logout-btn">
            <LogOut size={16} /> {t("logout")}
          </button>

          <button
            onClick={deleteAccount}
            disabled={deleting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-red-300 text-red-700 bg-white hover:bg-red-50 disabled:opacity-50 text-sm font-medium"
            data-testid="delete-account-btn"
          >
            <Trash2 size={16} /> {deleting ? "Deleting…" : "Delete My Account"}
          </button>
          <p className="text-[11px] text-brand-mute text-center px-4">
            Deleting your account is permanent. Contact your administrator if you need your data exported first.
          </p>
        </div>
      </div>
    </div>
  );
}
