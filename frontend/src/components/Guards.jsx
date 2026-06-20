import React, { useEffect } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { api } from "@/lib/api";

export function RequireAuth({ roles, children }) {
  const { user, token } = useApp();
  const location = useLocation();
  if (!token || !user) return <Navigate to="/" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) {
    if (user.role === "super_admin") return <Navigate to="/super-admin" replace />;
    return <Navigate to="/" replace />;
  }
  return children;
}

export function TenantScope({ children }) {
  const { slug } = useParams();
  const { tenant, loadPublicTenant } = useApp();
  const navigate = useNavigate();
  useEffect(() => {
    if (slug && (!tenant || tenant.slug !== slug)) {
      loadPublicTenant(slug).catch(() => navigate("/"));
    }
  }, [slug, tenant, loadPublicTenant, navigate]);
  return children;
}
