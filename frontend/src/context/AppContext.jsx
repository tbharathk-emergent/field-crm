import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { t as translate } from "@/lib/i18n";

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

  const t = useCallback((key) => translate(lang, key), [lang]);

  useEffect(() => { localStorage.setItem("fc_lang", lang); }, [lang]);

  useEffect(() => {
    if (tenant) applyTenantTheme(tenant.theme);
  }, [tenant]);

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
  };

  const logout = () => {
    setToken(null); setUser(null); setTenant(null);
    localStorage.removeItem("fc_token");
    localStorage.removeItem("fc_user");
    localStorage.removeItem("fc_tenant");
    setSlug(null);
  };

  const loadPublicTenant = useCallback(async (slug) => {
    const res = await api.get(`/public/tenants/by-slug/${slug}`);
    setTenant(res.data);
    setSlug(slug);
    applyTenantTheme(res.data.theme);
    return res.data;
  }, []);

  const refreshTenant = useCallback(async () => {
    try {
      const res = await api.get("/tenant/profile");
      setTenant(res.data);
      localStorage.setItem("fc_tenant", JSON.stringify(res.data));
      applyTenantTheme(res.data.theme);
    } catch {}
  }, []);

  return (
    <AppContext.Provider value={{
      token, user, tenant, lang, setLang, t,
      loginSuccess, logout, loadPublicTenant, refreshTenant, applyTenantTheme,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);

export function getLabel(tenant, key, fallback) {
  return (tenant?.labels && tenant.labels[key]) || fallback || key;
}
