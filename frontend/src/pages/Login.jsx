import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, MessageSquare, ShieldAlert, Smartphone, ShoppingBag, Briefcase } from "lucide-react";
import { toast } from "sonner";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import TenantLogo from "@/components/TenantLogo";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";

const SUPER_ADMIN_PHONE = "9858558555";

/**
 * Backend errors may return either `detail: "string"` (legacy) or
 * `detail: { code, message }` (Phase 2/3/4 structured errors). Sonner
 * cannot render an object — it prints "[object Object]" — so we always
 * squash to a user-readable string here.
 *
 * Special-cases 502/503/504 & network failures with a friendlier warm-up
 * message; those are almost always the preview container cold-starting.
 */
function errMsg(e, fallback) {
  const status = e?.response?.status;
  if (status === 502 || status === 503 || status === 504) {
    return "Server is warming up. Please try again in a few seconds.";
  }
  if (!e?.response) {
    // Network failure / timeout / CORS block → no response object at all.
    return "Can't reach the server right now. Check your connection and try again.";
  }
  const d = e?.response?.data?.detail;
  if (!d) return fallback;
  if (typeof d === "string") return d;
  if (typeof d === "object") return d.message || d.code || fallback;
  return fallback;
}

/** Sleep helper for retry with backoff. */
const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function Login() {
  const { slug } = useParams();
  const { tenant, t, loginSuccess, loadPublicTenant } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState("phone"); // phone | otp
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [channel, setChannel] = useState("sms");
  const [roleHint, setRoleHint] = useState(null); // 'customer' if entering shop
  const [mockOtp, setMockOtp] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [creds, setCreds] = useState(null);

  const isSuperAdminPhone = phone === SUPER_ADMIN_PHONE;
  const isTenantScope = !!slug;

  useEffect(() => {
    api.get("/public/demo-credentials").then((r) => setCreds(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (slug && (!tenant || tenant.slug !== slug)) {
      loadPublicTenant(slug).catch(() => toast.error("Tenant not found"));
    }
  }, [slug, tenant, loadPublicTenant]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setTimeout(() => setResendIn(resendIn - 1), 1000);
    return () => clearTimeout(id);
  }, [resendIn]);

  const sendOtp = async () => {
    if (!phone || phone.length < 6) return toast.error("Enter valid phone");
    setLoading(true);
    // Retry once on 502/503/504 or network errors — preview containers cold-start
    // through Cloudflare and can 502 for the first ~2-5 seconds after a scale-up.
    const attempt = async () => api.post("/auth/request-otp", {
      phone, tenant_slug: slug, channel, role_hint: roleHint,
    });
    let res;
    try {
      try {
        res = await attempt();
      } catch (e) {
        const status = e?.response?.status;
        const transient = !e?.response || status === 502 || status === 503 || status === 504;
        if (!transient) throw e;
        toast.info("Server warming up… retrying");
        await _sleep(1500);
        res = await attempt();
      }
      setMockOtp(res.data.mock_otp);
      setStep("otp");
      setResendIn(30);
      toast.success(`OTP sent via ${channel.toUpperCase()} (mock: ${res.data.mock_otp})`);
    } catch (e) {
      // Surface the backend reason so users see the real cause instead of a generic "Failed to send OTP".
      // Also logs to console for support triage.
      const msg = errMsg(e, "Failed to send OTP");
      console.error("request-otp failed:", e?.response?.status, e?.response?.data || e?.message);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp) return toast.error("Enter OTP");
    setLoading(true);
    try {
      const res = await api.post("/auth/verify-otp", {
        phone, otp, tenant_slug: slug, role_hint: roleHint,
      });
      loginSuccess(res.data);
      const u = res.data.user;
      const tslug = res.data.tenant?.slug || slug;
      toast.success(`${t("welcome")}, ${u.name || u.phone}`);
      if (u.role === "super_admin") navigate("/super-admin");
      else if (u.role === "tenant_admin") navigate(`/t/${tslug}/admin`);
      else if (u.role === "manager") navigate(`/t/${tslug}/manager`);
      else if (u.role === "customer" || u.role === "dealer") navigate(`/t/${tslug}/shop`);
      else navigate(`/t/${tslug}/app`);
    } catch (e) {
      const msg = errMsg(e, "Invalid OTP");
      console.error("verify-otp failed:", e?.response?.status, e?.response?.data || e?.message);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (demoPhone, hint = null) => {
    setPhone(demoPhone);
    setRoleHint(hint);
  };

  const heroImg = "https://images.unsplash.com/photo-1528280469494-bc0421abebab?crop=entropy&cs=srgb&fm=jpg&q=70&w=1200";

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-brand-bg">
      {/* Left hero */}
      <div
        className="lg:w-1/2 relative min-h-[240px] lg:min-h-screen flex flex-col justify-between p-6 sm:p-10 text-white"
        style={{
          backgroundImage: `linear-gradient(rgba(0,40,20,0.55), rgba(0,20,10,0.75)), url('${heroImg}')`,
          backgroundSize: "cover", backgroundPosition: "center",
        }}
      >
        <Link to="/" data-testid="back-to-landing" className="inline-flex items-center gap-2 text-sm text-white/90 hover:text-white">
          <ArrowLeft size={16} /> {t("back")}
        </Link>
        <div className="space-y-4 max-w-md">
          {tenant && (
            <div className="flex items-center gap-3 bg-white/10 backdrop-blur rounded-2xl p-3 w-fit border border-white/20">
              <TenantLogo tenant={tenant} size={44} />
              <div>
                <div className="font-display font-bold text-lg leading-tight">{tenant.name}</div>
                <div className="text-xs opacity-80">{tenant.business_type}</div>
              </div>
            </div>
          )}
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
            {tenant ? `Welcome to ${tenant.name}` : "FieldCRM"}
          </h1>
          <p className="text-white/85 text-sm sm:text-base">{t("app_tagline")}</p>
        </div>
        <div className="hidden lg:block text-xs text-white/70">© localappstore.in</div>
      </div>

      {/* Right form */}
      <div className="lg:w-1/2 flex items-start lg:items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-md space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="label-up">{isTenantScope ? "Tenant Login" : "Platform Login"}</div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold mt-1">{t("login")}</h2>
            </div>
            <LanguageSwitcher />
          </div>

          {isSuperAdminPhone && (
            <div className="card-surface p-4 border-l-4 border-l-brand-secondary flex gap-3 items-start">
              <ShieldAlert className="text-brand-secondary mt-0.5" size={20} />
              <div className="text-sm">
                <div className="font-semibold">{t("super_admin_login")}</div>
                <div className="text-brand-mute text-xs mt-0.5">Use OTP <span className="font-mono font-semibold">557725</span></div>
              </div>
            </div>
          )}

          {isTenantScope && tenant && (
            <div className="grid grid-cols-3 gap-2">
              <button
                data-testid="role-employee-tab"
                onClick={() => setRoleHint(null)}
                className={`px-2 py-2.5 rounded-xl text-xs font-medium transition flex items-center justify-center gap-1.5 border ${
                  !roleHint ? "bg-brand-primary text-white border-brand-primary" : "bg-white border-brand-line text-brand-ink"
                }`}
              >
                <Briefcase size={14} /> Staff
              </button>
              <button
                data-testid="role-dealer-tab"
                onClick={() => setRoleHint("dealer")}
                className={`px-2 py-2.5 rounded-xl text-xs font-medium transition flex items-center justify-center gap-1.5 border ${
                  roleHint === "dealer" ? "bg-brand-secondary text-white border-brand-secondary" : "bg-white border-brand-line text-brand-ink"
                }`}
              >
                <ShoppingBag size={14} /> {tenant.labels?.dealer || "Dealer"}
              </button>
              <button
                data-testid="role-customer-tab"
                onClick={() => setRoleHint("customer")}
                className={`px-2 py-2.5 rounded-xl text-xs font-medium transition flex items-center justify-center gap-1.5 border ${
                  roleHint === "customer" ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-brand-line text-brand-ink"
                }`}
              >
                <ShoppingBag size={14} /> {tenant.labels?.customer || "Customer"}
              </button>
            </div>
          )}

          {step === "phone" ? (
            <div className="space-y-4">
              <div>
                <label className="label-up block mb-2">{t("phone")}</label>
                <div className="flex items-center bg-white rounded-xl border border-brand-line px-3 h-12">
                  <span className="text-brand-mute text-sm pr-2 border-r border-brand-line">+91</span>
                  <input
                    data-testid="phone-input"
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 12))}
                    placeholder={t("enter_phone")}
                    className="flex-1 outline-none bg-transparent pl-3 text-base"
                  />
                  <Smartphone size={18} className="text-brand-mute" />
                </div>
              </div>

              <div>
                <label className="label-up block mb-2">{t("language") /* channel */}</label>
                <div className="flex gap-2">
                  {["sms", "whatsapp"].map((c) => (
                    <button
                      key={c}
                      data-testid={`channel-${c}`}
                      onClick={() => setChannel(c)}
                      className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium border transition ${
                        channel === c ? "bg-brand-primary text-white border-brand-primary" : "bg-white border-brand-line"
                      }`}
                    >
                      {c === "sms" ? t("sms") : t("whatsapp")}
                    </button>
                  ))}
                </div>
              </div>

              <button
                data-testid="send-otp-btn"
                onClick={sendOtp}
                disabled={loading}
                className="btn-primary w-full disabled:opacity-60"
              >
                {loading ? "..." : t("send_otp")}
              </button>

              {/* Demo logins */}
              {creds && (
                <div className="card-surface p-4">
                  <div className="label-up mb-2">{t("demo_logins")}</div>
                  <div className="text-xs text-brand-mute mb-3">
                    {isTenantScope
                      ? `Tenant: ${tenant?.name || slug} · OTP: 123456`
                      : `Super Admin OTP: 557725 · Other users use OTP: 123456`}
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {!isTenantScope && (
                      <button
                        data-testid="demo-superadmin"
                        onClick={() => fillDemo(creds.super_admin.phone)}
                        className="flex items-center justify-between px-3 py-2 rounded-lg border border-brand-line hover:bg-brand-bg text-left"
                      >
                        <span className="text-sm font-medium">{t("super_admin")}</span>
                        <span className="text-xs font-mono text-brand-mute">{creds.super_admin.phone}</span>
                      </button>
                    )}
                    {isTenantScope && creds.users.map((u) => {
                      const isCust = u.role === "customer";
                      const isDealer = u.role === "dealer";
                      // Filter based on selected tab
                      if (roleHint === "customer" && !isCust) return null;
                      if (roleHint === "dealer" && !isDealer) return null;
                      if (!roleHint && (isCust || isDealer)) return null;
                      return (
                        <button
                          key={u.phone}
                          data-testid={`demo-${u.role}`}
                          onClick={() => fillDemo(u.phone, isCust ? "customer" : isDealer ? "dealer" : null)}
                          className="flex items-center justify-between px-3 py-2 rounded-lg border border-brand-line hover:bg-brand-bg text-left"
                        >
                          <span className="text-sm font-medium">{u.label}</span>
                          <span className="text-xs font-mono text-brand-mute">{u.phone}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="label-up block mb-2">{t("enter_otp")}</label>
                <input
                  data-testid="otp-input"
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  className="w-full h-14 px-4 text-center text-2xl tracking-[0.5em] font-mono bg-white rounded-xl border border-brand-line outline-none focus:border-brand-primary"
                />
                {mockOtp && (
                  <div className="mt-2 text-xs text-brand-mute">
                    Mock OTP (visible in MVP): <span className="font-mono font-semibold text-brand-primary">{mockOtp}</span>
                  </div>
                )}
              </div>

              <button
                data-testid="verify-otp-btn"
                onClick={verifyOtp}
                disabled={loading || otp.length < 4}
                className="btn-primary w-full disabled:opacity-60"
              >
                {loading ? "..." : t("verify_otp")}
              </button>

              <div className="flex items-center justify-between text-sm">
                <button
                  data-testid="change-phone-btn"
                  onClick={() => { setStep("phone"); setOtp(""); }}
                  className="text-brand-mute hover:text-brand-ink"
                >
                  ← {phone}
                </button>
                <button
                  data-testid="resend-otp-btn"
                  onClick={sendOtp}
                  disabled={resendIn > 0}
                  className="text-brand-primary font-medium disabled:opacity-50"
                >
                  {resendIn > 0 ? `${t("resend_otp_in")} ${resendIn}s` : t("resend_otp")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
