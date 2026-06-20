import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("fc_token");
  const slug = localStorage.getItem("fc_tenant_slug");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (slug) config.headers["X-Tenant-Slug"] = slug;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      // do not auto-clear on every 401 to avoid redirect loops; let pages decide
    }
    return Promise.reject(err);
  }
);

export const fileUrl = (path) => {
  if (!path) return null;
  const token = localStorage.getItem("fc_token");
  return `${API}/files/view?path=${encodeURIComponent(path)}&auth=${encodeURIComponent(token || "")}`;
};
