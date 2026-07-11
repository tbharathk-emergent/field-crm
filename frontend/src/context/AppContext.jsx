import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { t as translate } from "@/lib/i18n";
import { registerPushNotifications, unregisterPushNotifications } from "@/lib/pushNotifications";

const AppContext = createContext(null);

function applyTenantTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;
  if (theme.primary) root.style.setProperty("--brand-primary", theme.primary);
  if (theme.primary_hover) root.style.setProperty("--brand-primary-hover", theme.primary_hover);
  if (theme.secondary) root.style.setProperty("--brand-secondary", theme.secondary);
}

export function AppProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("fc_token") || null);
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem("fc_user");
    return u ? JSON.parse(u) : null;
  });
  const [tenant, setTenant] = useState(() => {
    const t = localStorage.getItem("fc_tenant");
    return t ? JSON.parse(t) : null;
  });
  const [lang, setLang] = useState(() => localStorage.getItem("fc_lang") || "en");
  const [permissions, setPermissions] = useState(() => {
    const p = localStorage.getItem("fc_perms");
    return p ? JSON.parse(p) : {};
  });
  const [customFields, setCustomFields] = useState([]);
  const [features, setFeatures] = useState(() => tenant?.features || {});

  const t = useCallback((key) => translate(lang, key), [lang]);

  useEffect(() => { localStorage.setItem("fc_lang", lang); }, [lang]);

  useEffect(() => {
    if (tenant) applyTenantTheme(tenant.theme);
  }, [tenant]);

  // Load permissions on token change
  useEffect(() => {
    if (!token) { setPermissions({}); localStorage.removeItem("fc_perms"); return; }
    api.get("/my-permissions").then((r) => {
      const p = r.data?.permissions || {};
      setPermissions(p);
      localStorage.setItem("fc_perms", JSON.stringify(p));
    }).catch(() => {});
  }, [token]);

  // Load & cache all custom fields per tenant/user on token change
  useEffect(() => {
    if (!token) { setCustomFields([]); return; }
    api.get("/custom-fields").then((r) => setCustomFields(r.data || [])).catch(() => {});
  }, [token]);

  // Reflect features change when tenant updates
  useEffect(() => { setFeatures(tenant?.features || {}); }, [tenant]);

  const customFieldsFor = useCallback((module) => (
    customFields.filter((f) => f.module === module).sort((a, b) => (a.order || 0) - (b.order || 0))
  ), [customFields]);

  const hasFeature = useCallback((key) => !!features[key], [features]);

  const can = useCallback((module, action = "read") => {
    if (user?.role === "super_admin" || user?.role === "tenant_admin") return true;
    return !!(permissions?.[module]?.[action]);
  }, [permissions, user]);

  const setSlug = (slug) => {
    if (slug) localStorage.setItem("fc_tenant_slug", slug);
    else localStorage.removeItem("fc_tenant_slug");
  };

  const loginSuccess = ({ token, user, tenant }) => {
    setToken(token);
    setUser(user);
    setTenant(tenant);
    localStorage.setItem("fc_token", token);
    localStorage.setItem("fc_user", JSON.stringify(user));
    if (tenant) {
      localStorage.setItem("fc_tenant", JSON.stringify(tenant));
      setSlug(tenant.slug);
      applyTenantTheme(tenant.theme);
    } else {
      localStorage.removeItem("fc_tenant");
      setSlug(null);
    }
    // Kick off push notification registration on native builds. Fires the OS
    // permission prompt on first login and posts the FCM token to the backend
    // via /api/push/register. Idempotent — safe to call on every login.
    // Runs async in the background; UI does not block on it.
    setTimeout(() => { registerPushNotifications().catch(() => {}); }, 500);
  };

  const logout = () => {
    // Best-effort unregister the current device token BEFORE we drop the JWT
    // (the endpoint requires auth). Fire-and-forget.
    unregisterPushNotifications().catch(() => {});
    setToken(null); setUser(null); setTenant(null);
    localStorage.removeItem("fc_token");
    localStorage.removeItem("fc_user");
    localStorage.removeItem("fc_tenant");
    localStorage.removeItem("fc_perms");
    setSlug(null);
  };

  const loadPublicTenant = useCallback(async (slug) => {
    try {
      const res = await api.get(`/public/tenants/by-slug/${slug}`);
      setTenant(res.data);
      setSlug(slug);
      applyTenantTheme(res.data.theme);
      return res.data;
    } catch (err) {
      // Phase 2 — Stale tenant self-heal: backend returns 404 with code=tenant_not_found
      // when a slug has been deleted or renamed. Purge local cache so the app
      // recovers to Landing instead of looping on a dead tenant.
      const code = err?.response?.data?.detail?.code;
      if (err?.response?.status === 404 && code === "tenant_not_found") {
        setTenant(null);
        setSlug(null);
        localStorage.removeItem("fc_tenant");
      }
      throw err;
    }
  }, []);

  // Phase 2 — Subdomain / custom-domain auto-resolution on boot.
  // Runs once: if the current host maps to a tenant via ROOT_DOMAIN or custom_domain,
  // hydrate the tenant *without* requiring the user to visit /t/:slug manually.
  const resolveHostTenant = useCallback(async () => {
    try {
      const host = window.location.host;
      const res = await api.get(`/public/tenant-resolve?host=${encodeURIComponent(host)}`);
      const t = res.data?.tenant;
      if (t && t.slug) {
        setTenant(t);
        setSlug(t.slug);
        localStorage.setItem("fc_tenant", JSON.stringify(t));
        applyTenantTheme(t.theme);
      }
      return res.data;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    // Only auto-resolve when the app boots without an active session and no cached tenant.
    if (!token && !tenant) {
      resolveHostTenant();
    }
  }, [token, tenant, resolveHostTenant]);

  // Phase 10 — Push notifications: register on app boot if the user has a
  // valid session (returning user, not a fresh login). Runs once per mount.
  useEffect(() => {
    if (token && user) {
      registerPushNotifications().catch(() => {});
    }
  }, []);

  const refreshTenant = useCallback(async () => {
    try {
      const res = await api.get("/tenant/profile");
      setTenant(res.data);
      localStorage.setItem("fc_tenant", JSON.stringify(res.data));
      applyTenantTheme(res.data.theme);
    } catch { /* profile refresh best-effort */ }
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const res = await api.get("/auth/me");
      if (res.data.user) {
        setUser(res.data.user);
        localStorage.setItem("fc_user", JSON.stringify(res.data.user));
      }
    } catch { /* auth/me refresh best-effort */ }
  }, []);

  return (
    <AppContext.Provider value={{
      token, user, tenant, lang, setLang, t, permissions, can,
      loginSuccess, logout, loadPublicTenant, refreshTenant, applyTenantTheme, refreshMe,
      resolveHostTenant,
      customFields, customFieldsFor, features, hasFeature,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);

export function getLabel(tenant, key, fallback) {
  return (tenant?.labels && tenant.labels[key]) || fallback || key;
}
