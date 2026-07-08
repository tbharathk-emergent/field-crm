import React, { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router-dom";
import {
  Sprout, Bug, Leaf, AlertTriangle, Sparkles, Clock, Heart, Search as SearchIcon,
  ChevronRight, ArrowLeft, Bookmark, BookmarkCheck, Share2, MessageSquare, ShoppingBag,
  Droplet, Wind, Sun, Cloud, ChevronDown, ChevronUp, MapPin, FileText, Calculator,
  Shield, AlertCircle, Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useApp, getLabel } from "@/context/AppContext";

/* ============================================================
 * Crop Health Advisor — user-facing hub + all sub-views.
 * Sub-view is driven by ?view= query so bottom-tabs & routing stay simple.
 * ============================================================ */

const SEVERITY_STYLE = {
  low:      { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", dot: "bg-emerald-500", label: "Low" },
  medium:   { bg: "bg-amber-50",   text: "text-amber-700",   ring: "ring-amber-200",   dot: "bg-amber-500",   label: "Medium" },
  high:     { bg: "bg-orange-50",  text: "text-orange-700",  ring: "ring-orange-200",  dot: "bg-orange-500",  label: "High" },
  critical: { bg: "bg-red-50",     text: "text-red-700",     ring: "ring-red-200",     dot: "bg-red-500",     label: "Critical" },
};

const TYPE_META = {
  disease:    { icon: Leaf,   label: "Disease",              color: "#D35400" },
  pest:       { icon: Bug,    label: "Pest",                 color: "#8E44AD" },
  deficiency: { icon: Sprout, label: "Nutrient Deficiency",  color: "#16A085" },
};

export default function CropAdvisor() {
  const { user, tenant, hasFeature, t, refreshMe } = useApp();
  const navigate = useNavigate();
  const { slug } = useParams();
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view") || "home";
  const [crops, setCrops] = useState([]);
  const [seasonal, setSeasonal] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [recent, setRecent] = useState([]);
  const [myCrops, setMyCrops] = useState(user?.my_crops || []);
  const [savingCrops, setSavingCrops] = useState(false);

  const go = (v, extra = {}) => {
    const p = new URLSearchParams({ view: v, ...extra });
    navigate(`?${p.toString()}`, { replace: false });
  };

  useEffect(() => {
    if (!hasFeature("crop_advisor")) return;
    Promise.all([
      api.get("/crops").then((r) => setCrops(r.data)).catch(() => {}),
      api.get("/seasonal-advisories", { params: { active_only: true } }).then((r) => setSeasonal(r.data)).catch(() => {}),
      api.get("/favorites", { params: { entity_type: "advisory" } }).then((r) => setFavorites(r.data)).catch(() => {}),
      api.get("/recent-views", { params: { entity_type: "advisory", limit: 10 } }).then((r) => setRecent(r.data)).catch(() => {}),
    ]);
  }, [hasFeature]);

  useEffect(() => { setMyCrops(user?.my_crops || []); }, [user]);

  if (!hasFeature("crop_advisor")) {
    return (
      <div className="text-center py-12">
        <Sprout size={48} className="mx-auto text-brand-mute mb-3" />
        <div className="font-display font-semibold">Crop Advisor is not enabled</div>
        <div className="text-xs text-brand-mute mt-1">Ask your administrator to enable this module.</div>
      </div>
    );
  }

  const myCropDocs = crops.filter((c) => myCrops.includes(c.id));

  /* ---------------- HOME ---------------- */
  if (view === "home") {
    return (
      <div className="space-y-4 pb-4">
        <div className="flex items-center gap-2">
          <Sprout className="text-brand-primary" size={22} />
          <h1 className="font-display text-xl font-bold">Crop Health Advisor</h1>
        </div>

        {/* Seasonal alerts ribbon */}
        {seasonal.length > 0 && (
          <div className="space-y-2">
            {seasonal.slice(0, 2).map((s) => {
              const st = SEVERITY_STYLE[s.severity] || SEVERITY_STYLE.medium;
              return (
                <div key={s.id} data-testid={`seasonal-${s.id}`}
                     className={`rounded-xl border ${st.bg} ${st.ring} ring-1 p-3`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className={st.text} />
                    <div className="min-w-0 flex-1">
                      <div className={`font-medium text-sm ${st.text}`}>{s.title}</div>
                      <div className="text-xs text-brand-ink/80 mt-0.5 line-clamp-2">{s.message}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Hub grid */}
        <div className="grid grid-cols-2 gap-3">
          <HubCard testid="ca-mycrops" icon={Sprout} label="My Crops" count={myCropDocs.length}
                    color="#27AE60" onClick={() => go("mycrops")} />
          <HubCard testid="ca-diseases" icon={Leaf} label="Diseases"
                    color="#D35400" onClick={() => go("list", { type: "disease" })} />
          <HubCard testid="ca-pests" icon={Bug} label="Pests"
                    color="#8E44AD" onClick={() => go("list", { type: "pest" })} />
          <HubCard testid="ca-deficiencies" icon={Sprout} label="Nutrient Deficiencies"
                    color="#16A085" onClick={() => go("list", { type: "deficiency" })} />
          <HubCard testid="ca-alerts" icon={AlertTriangle} label="Seasonal Alerts"
                    color="#E74C3C" count={seasonal.length} onClick={() => go("alerts")} />
          <HubCard testid="ca-ai" icon={Sparkles} label="AI Detection" hint="Coming soon"
                    color="#9B59B6" disabled />
          <HubCard testid="ca-recent" icon={Clock} label="Recently Viewed" count={recent.length}
                    color="#2980B9" onClick={() => go("recent")} />
          <HubCard testid="ca-favorites" icon={Heart} label="Favourites" count={favorites.length}
                    color="#E91E63" onClick={() => go("favorites")} />
        </div>

        {/* Search bar */}
        <button data-testid="ca-search-btn" onClick={() => go("search")}
                className="w-full card-surface p-3 flex items-center gap-2 text-brand-mute text-sm">
          <SearchIcon size={16} />
          Search diseases, pests, symptoms…
        </button>

        {/* My Crops row */}
        {myCropDocs.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="font-display font-semibold text-sm">My Crops</div>
              <button onClick={() => go("mycrops")} className="text-xs text-brand-primary">Edit</button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
              {myCropDocs.map((c) => (
                <button key={c.id} onClick={() => go("crop", { cid: c.id })}
                        data-testid={`crop-chip-${c.id}`}
                        className="flex-shrink-0 card-surface p-3 min-w-[110px] text-center hover:border-brand-primary transition">
                  <Sprout size={22} className="mx-auto text-brand-primary mb-1" />
                  <div className="font-medium text-xs">{c.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ---------------- MY CROPS SELECTOR ---------------- */
  if (view === "mycrops") {
    const toggle = (id) => {
      setMyCrops((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    };
    const save = async () => {
      setSavingCrops(true);
      try {
        await api.patch("/me/my-crops", { crop_ids: myCrops });
        if (refreshMe) await refreshMe();
        toast.success("Saved");
        go("home");
      } catch { toast.error("Failed"); }
      finally { setSavingCrops(false); }
    };
    return (
      <div className="space-y-3 pb-4">
        <button onClick={() => go("home")} className="text-brand-mute inline-flex items-center gap-1 text-sm"><ArrowLeft size={14} /> Back</button>
        <h1 className="font-display text-xl font-bold">My Crops</h1>
        <div className="text-sm text-brand-mute">Select the crops you grow to personalise advisories.</div>
        <div className="grid grid-cols-2 gap-2">
          {crops.map((c) => {
            const on = myCrops.includes(c.id);
            return (
              <button key={c.id} onClick={() => toggle(c.id)}
                      data-testid={`mycrop-${c.id}`}
                      className={`card-surface p-3 text-left transition ${on ? "ring-2 ring-brand-primary border-brand-primary" : ""}`}>
                <div className="flex items-start gap-2">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${on ? "bg-brand-primary text-white" : "bg-brand-bg text-brand-primary"}`}>
                    <Sprout size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{c.name}</div>
                    <div className="text-[11px] text-brand-mute truncate">{c.season || c.scientific_name}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <button data-testid="save-mycrops-btn" onClick={save} disabled={savingCrops}
                className="btn-primary w-full">
          {savingCrops ? "Saving..." : `Save (${myCrops.length} selected)`}
        </button>
      </div>
    );
  }

  /* ---------------- CROP DASHBOARD ---------------- */
  if (view === "crop") {
    return <CropDashboard cid={params.get("cid")} crops={crops} onGo={go} />;
  }

  /* ---------------- LIST ---------------- */
  if (view === "list") {
    return <AdvisoryList type={params.get("type") || "disease"} crops={crops} onGo={go}
                          initialCrop={params.get("cid") || ""} />;
  }

  /* ---------------- DETAIL ---------------- */
  if (view === "detail") {
    return <AdvisoryDetail id={params.get("id")} crops={crops} onGo={go}
                            slug={slug} favorites={favorites}
                            onFavChange={() => api.get("/favorites").then((r) => setFavorites(r.data))} />;
  }

  /* ---------------- ALERTS ---------------- */
  if (view === "alerts") {
    return (
      <div className="space-y-3 pb-4">
        <button onClick={() => go("home")} className="text-brand-mute inline-flex items-center gap-1 text-sm"><ArrowLeft size={14} /> Back</button>
        <h1 className="font-display text-xl font-bold">Seasonal Alerts</h1>
        {seasonal.length === 0 && <div className="text-center text-brand-mute py-8">No active alerts</div>}
        {seasonal.map((s) => {
          const st = SEVERITY_STYLE[s.severity] || SEVERITY_STYLE.medium;
          return (
            <div key={s.id} className={`rounded-xl border ${st.bg} ${st.ring} ring-1 p-4`}>
              <div className="flex items-start gap-2">
                <AlertTriangle size={18} className={st.text} />
                <div className="flex-1 min-w-0">
                  <div className={`font-display font-semibold ${st.text}`}>{s.title}</div>
                  <div className="text-sm text-brand-ink mt-1">{s.message}</div>
                  <div className="text-[11px] text-brand-mute mt-2 flex flex-wrap gap-2">
                    {s.valid_from && <span>From {s.valid_from}</span>}
                    {s.valid_to && <span>• Until {s.valid_to}</span>}
                    {s.states.length > 0 && <span>• {s.states.join(", ")}</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /* ---------------- FAVORITES ---------------- */
  if (view === "favorites") {
    return <FavoritesOrRecent title="Favourites" items={favorites} onGo={go} onBack={() => go("home")} />;
  }
  if (view === "recent") {
    return <FavoritesOrRecent title="Recently Viewed" items={recent} onGo={go} onBack={() => go("home")} />;
  }

  /* ---------------- SEARCH ---------------- */
  if (view === "search") {
    return <SearchView crops={crops} onGo={go} />;
  }

  return null;
}

/* -------------- Sub-components -------------- */

function HubCard({ icon: Icon, label, count, color, onClick, disabled, hint, testid }) {
  return (
    <button data-testid={testid} onClick={disabled ? undefined : onClick}
            disabled={disabled}
            className={`card-surface p-3 text-left transition ${disabled ? "opacity-50" : "hover:border-brand-primary active:scale-[0.98]"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white flex-shrink-0"
             style={{ background: color }}>
          <Icon size={18} />
        </div>
        {typeof count === "number" && count > 0 && (
          <span className="text-[10px] font-mono bg-brand-bg text-brand-ink rounded-full px-2 py-0.5">{count}</span>
        )}
      </div>
      <div className="mt-2 font-medium text-sm leading-tight">{label}</div>
      {hint && <div className="text-[10px] text-brand-mute mt-0.5">{hint}</div>}
    </button>
  );
}

function CropDashboard({ cid, crops, onGo }) {
  const [summary, setSummary] = useState(null);
  const [entries, setEntries] = useState([]);
  const crop = crops.find((c) => c.id === cid);

  useEffect(() => {
    if (!cid) return;
    api.get(`/crops/${cid}/summary`).then((r) => setSummary(r.data)).catch(() => {});
    api.get("/advisory-entries", { params: { crop_id: cid, limit: 30 } }).then((r) => setEntries(r.data.items || [])).catch(() => {});
  }, [cid]);

  if (!crop) return <div className="text-center py-8 text-brand-mute">Crop not found</div>;
  const counts = summary?.counts || {};
  const products = summary?.products || [];

  return (
    <div className="space-y-3 pb-4">
      <button onClick={() => onGo("home")} className="text-brand-mute inline-flex items-center gap-1 text-sm"><ArrowLeft size={14} /> Back</button>
      <div className="card-surface p-4">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-brand-primary/10 flex items-center justify-center">
            <Sprout size={30} className="text-brand-primary" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold">{crop.name}</h1>
            <div className="text-xs text-brand-mute">{crop.scientific_name} · {crop.season}</div>
          </div>
        </div>
        {crop.description && <div className="mt-2 text-sm text-brand-ink">{crop.description}</div>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Diseases" value={counts.disease || 0} icon={Leaf} color="#D35400"
                   onClick={() => onGo("list", { type: "disease", cid })} testid="stat-diseases" />
        <StatTile label="Pests" value={counts.pest || 0} icon={Bug} color="#8E44AD"
                   onClick={() => onGo("list", { type: "pest", cid })} testid="stat-pests" />
        <StatTile label="Deficiencies" value={counts.deficiency || 0} icon={Sprout} color="#16A085"
                   onClick={() => onGo("list", { type: "deficiency", cid })} testid="stat-defs" />
      </div>

      {products.length > 0 && (
        <div>
          <div className="font-display font-semibold text-sm mb-2">Recommended Products</div>
          <div className="grid grid-cols-2 gap-2">
            {products.slice(0, 4).map((p) => (
              <div key={p.id} className="card-surface p-3">
                <div className="font-medium text-sm truncate">{p.name}</div>
                <div className="text-[11px] text-brand-mute truncate">{p.packing}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div>
          <div className="font-display font-semibold text-sm mb-2">Recent advisories</div>
          <div className="space-y-2">
            {entries.slice(0, 5).map((e) => (
              <AdvisoryCard key={e.id} entry={e} onGo={onGo} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, icon: Icon, color, onClick, testid }) {
  return (
    <button data-testid={testid} onClick={onClick}
            className="card-surface p-3 text-center">
      <div className="w-8 h-8 rounded-full mx-auto flex items-center justify-center text-white" style={{ background: color }}>
        <Icon size={14} />
      </div>
      <div className="font-display text-xl font-bold mt-1">{value}</div>
      <div className="text-[10px] text-brand-mute leading-tight">{label}</div>
    </button>
  );
}

function AdvisoryList({ type, crops, onGo, initialCrop }) {
  const [entries, setEntries] = useState([]);
  const [cropFilter, setCropFilter] = useState(initialCrop);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    const params = { type, limit: 50 };
    if (cropFilter) params.crop_id = cropFilter;
    if (q) params.q = q;
    api.get("/advisory-entries", { params })
      .then((r) => setEntries(r.data.items || []))
      .finally(() => setLoading(false));
  };
  useEffect(load, [type, cropFilter, q]);

  const meta = TYPE_META[type] || TYPE_META.disease;
  const Icon = meta.icon;

  return (
    <div className="space-y-3 pb-4">
      <button onClick={() => onGo("home")} className="text-brand-mute inline-flex items-center gap-1 text-sm"><ArrowLeft size={14} /> Back</button>
      <div className="flex items-center gap-2">
        <Icon className="text-brand-primary" size={22} />
        <h1 className="font-display text-xl font-bold">{meta.label}s</h1>
      </div>

      <div className="space-y-2">
        <Input data-testid="list-search" placeholder="Search by name, symptom, keyword" value={q}
               onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
          <button onClick={() => setCropFilter("")}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap ${!cropFilter ? "bg-brand-primary text-white border-brand-primary" : "border-brand-line text-brand-mute"}`}>
            All crops
          </button>
          {crops.map((c) => (
            <button key={c.id} onClick={() => setCropFilter(c.id)}
                    data-testid={`crop-filter-${c.id}`}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap ${cropFilter === c.id ? "bg-brand-primary text-white border-brand-primary" : "border-brand-line text-brand-mute"}`}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {loading && <div className="text-center text-brand-mute text-sm py-4">Loading…</div>}
        {!loading && entries.map((e) => <AdvisoryCard key={e.id} entry={e} onGo={onGo} />)}
        {!loading && entries.length === 0 && <div className="text-center text-brand-mute py-8">No entries found</div>}
      </div>
    </div>
  );
}

function AdvisoryCard({ entry, onGo }) {
  const st = SEVERITY_STYLE[entry.severity] || SEVERITY_STYLE.medium;
  const photo = entry.photos?.[0];
  const meta = TYPE_META[entry.type] || TYPE_META.disease;
  return (
    <button data-testid={`advisory-card-${entry.id}`}
            onClick={() => onGo("detail", { id: entry.id })}
            className="card-surface p-3 w-full text-left flex gap-3 hover:border-brand-primary transition">
      <div className="w-16 h-16 rounded-lg bg-brand-bg flex-shrink-0 flex items-center justify-center overflow-hidden">
        {photo?.path ? <img src={photo.path} alt={entry.name} className="w-full h-full object-cover" /> :
          <meta.icon size={28} className="text-brand-primary/40" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm truncate">{entry.name}</span>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
        </div>
        {entry.scientific_name && <div className="text-[11px] text-brand-mute italic truncate">{entry.scientific_name}</div>}
        {entry.short_description && <div className="text-xs text-brand-mute mt-0.5 line-clamp-2">{entry.short_description}</div>}
        {entry.season && <div className="text-[10px] text-brand-mute mt-1">Season: {entry.season}</div>}
      </div>
      <ChevronRight size={16} className="text-brand-mute self-center flex-shrink-0" />
    </button>
  );
}

function FavoritesOrRecent({ title, items, onGo, onBack }) {
  const [entries, setEntries] = useState([]);
  useEffect(() => {
    const ids = items.map((f) => f.entity_id).filter(Boolean);
    if (ids.length === 0) { setEntries([]); return; }
    Promise.all(ids.map((id) => api.get(`/advisory-entries/${id}`).then((r) => r.data).catch(() => null)))
      .then((rs) => setEntries(rs.filter(Boolean)));
  }, [items]);
  return (
    <div className="space-y-3 pb-4">
      <button onClick={onBack} className="text-brand-mute inline-flex items-center gap-1 text-sm"><ArrowLeft size={14} /> Back</button>
      <h1 className="font-display text-xl font-bold">{title}</h1>
      {entries.length === 0 && <div className="text-center text-brand-mute py-8">Empty</div>}
      {entries.map((e) => <AdvisoryCard key={e.id} entry={e} onGo={onGo} />)}
    </div>
  );
}

function SearchView({ crops, onGo }) {
  const [q, setQ] = useState("");
  const [entries, setEntries] = useState([]);
  useEffect(() => {
    if (!q) { setEntries([]); return; }
    const tid = setTimeout(() => {
      api.get("/advisory-entries", { params: { q, limit: 30 } })
        .then((r) => setEntries(r.data.items || []));
    }, 300);
    return () => clearTimeout(tid);
  }, [q]);
  return (
    <div className="space-y-3 pb-4">
      <button onClick={() => onGo("home")} className="text-brand-mute inline-flex items-center gap-1 text-sm"><ArrowLeft size={14} /> Back</button>
      <h1 className="font-display text-xl font-bold">Search</h1>
      <Input data-testid="global-search" placeholder="Disease name, symptom, keyword, scientific name…" autoFocus
             value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="text-xs text-brand-mute">Voice search coming soon 🎙️</div>
      <div className="space-y-2">
        {entries.map((e) => <AdvisoryCard key={e.id} entry={e} onGo={onGo} />)}
        {q && entries.length === 0 && <div className="text-center text-brand-mute py-8">No results</div>}
      </div>
    </div>
  );
}

/* ---------------- DETAIL PAGE (all 18 sections) ---------------- */
function AdvisoryDetail({ id, crops, onGo, slug, favorites, onFavChange }) {
  const { user, tenant } = useApp();
  const [e, setE] = useState(null);
  const [products, setProducts] = useState([]);
  const [expanded, setExpanded] = useState({ symptoms: true, prevention: false, chemical: false, safety: false });
  const enquiryOnly = tenant?.catalog_mode === "enquiry_only" || user?.role === "customer";
  const isFav = favorites?.some((f) => f.entity_id === id);

  useEffect(() => {
    if (!id) return;
    api.get(`/advisory-entries/${id}`).then((r) => setE(r.data));
  }, [id]);

  useEffect(() => {
    if (!e?.product_ids?.length) return;
    api.get("/tenant/products").then((r) => {
      setProducts(r.data.filter((p) => e.product_ids.includes(p.id)));
    });
  }, [e]);

  if (!e) return <div className="text-center py-8 text-brand-mute">Loading…</div>;

  const st = SEVERITY_STYLE[e.severity] || SEVERITY_STYLE.medium;
  const crop = crops.filter((c) => e.crop_ids?.includes(c.id));

  const toggleFav = async () => {
    try {
      await api.post("/favorites/toggle", { entity_type: "advisory", entity_id: id });
      onFavChange?.();
    } catch { toast.error("Failed"); }
  };

  const share = async () => {
    const url = `${window.location.origin}/t/${slug}/advisor?view=detail&id=${id}`;
    const text = `${e.name} — ${e.short_description || ""}\n${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: e.name, text, url }); } catch {}
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    }
  };

  const enquireProduct = async (p) => {
    try {
      await api.post("/enquiries", {
        customer_id: user?.role === "customer" ? user.id : undefined,
        customer_name: user?.name || "Customer",
        mobile: user?.phone,
        category: `${TYPE_META[e.type]?.label} — ${e.name}`,
        description: `Product enquiry: ${p.name}${p.packing ? ` (${p.packing})` : ""} for ${e.name}`,
        source: user?.role === "customer" ? "customer" : "tenant",
      });
      toast.success("Enquiry submitted");
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const buyProduct = async (p) => {
    try {
      await api.post("/orders", { items: [{ product_id: p.id, quantity: 1 }] });
      toast.success("Order placed — check Orders");
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); }
  };

  const meta = TYPE_META[e.type] || TYPE_META.disease;

  return (
    <div className="space-y-3 pb-4">
      <div className="flex items-center justify-between">
        <button onClick={() => onGo("home")} className="text-brand-mute inline-flex items-center gap-1 text-sm"><ArrowLeft size={14} /> Back</button>
        <div className="flex gap-1">
          <button data-testid="fav-btn" onClick={toggleFav} className="w-9 h-9 rounded-full border border-brand-line flex items-center justify-center">
            {isFav ? <BookmarkCheck size={16} className="text-brand-primary" /> : <Bookmark size={16} className="text-brand-mute" />}
          </button>
          <button data-testid="share-btn" onClick={share} className="w-9 h-9 rounded-full border border-brand-line flex items-center justify-center">
            <Share2 size={16} className="text-brand-mute" />
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="card-surface p-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>{st.label} severity</span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary capitalize">
            {meta.label}
          </span>
          {e.category && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-brand-bg text-brand-mute capitalize">{e.category.replace("_", " ")}</span>}
        </div>
        <h1 className="font-display text-2xl font-bold mt-2">{e.name}</h1>
        {e.scientific_name && <div className="text-sm text-brand-mute italic">{e.scientific_name}</div>}
        {crop.length > 0 && (
          <div className="text-xs text-brand-mute mt-2">
            Affects: <span className="text-brand-ink font-medium">{crop.map((c) => c.name).join(", ")}</span>
          </div>
        )}
        {e.season && <div className="text-xs text-brand-mute">Season: {e.season}</div>}
        {e.short_description && <div className="mt-3 text-sm text-brand-ink">{e.short_description}</div>}
        {e.description && <div className="mt-2 text-sm text-brand-mute">{e.description}</div>}
      </div>

      {/* Photo gallery */}
      {e.photos?.length > 0 && (
        <div>
          <div className="font-display font-semibold text-sm mb-2">Photo Gallery</div>
          <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
            {e.photos.map((p, i) => (
              <div key={i} className="flex-shrink-0 w-28">
                <div className="aspect-square rounded-lg bg-brand-bg overflow-hidden">
                  {p.path && <img src={p.path} alt={p.label || ""} className="w-full h-full object-cover" />}
                </div>
                <div className="text-[10px] text-brand-mute mt-1 capitalize text-center">{p.stage}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Symptoms */}
      <Section title="Symptoms" icon={AlertCircle} expanded={expanded.symptoms}
               onToggle={() => setExpanded((s) => ({ ...s, symptoms: !s.symptoms }))}>
        <ul className="list-disc list-inside space-y-1 text-sm">
          {e.symptoms?.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </Section>

      {/* Cause */}
      {e.causes && (
        <Section title="Cause" icon={Zap} expanded>
          <div className="text-sm">{e.causes}</div>
        </Section>
      )}

      {/* Weather */}
      {(e.weather?.temperature || e.weather?.humidity || e.weather?.rainfall) && (
        <Section title="Weather Conditions" icon={Cloud} expanded>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {e.weather.temperature && <Stat icon={Sun} label="Temperature" value={e.weather.temperature} />}
            {e.weather.humidity && <Stat icon={Droplet} label="Humidity" value={e.weather.humidity} />}
            {e.weather.rainfall && <Stat icon={Cloud} label="Rainfall" value={e.weather.rainfall} />}
            {e.weather.season && <Stat icon={Sprout} label="Season" value={e.weather.season} />}
          </div>
        </Section>
      )}

      {/* Spread */}
      {e.spread?.length > 0 && (
        <Section title="How it Spreads" icon={Wind} expanded>
          <div className="flex flex-wrap gap-2">
            {e.spread.map((s, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full border border-brand-line capitalize">{s}</span>
            ))}
          </div>
        </Section>
      )}

      {/* Prevention */}
      {e.prevention?.length > 0 && (
        <Section title="Prevention" icon={Shield} expanded={expanded.prevention}
                 onToggle={() => setExpanded((s) => ({ ...s, prevention: !s.prevention }))}>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {e.prevention.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </Section>
      )}

      {/* Organic */}
      {(e.organic_treatment || e.bio_control || e.natural_remedies) && (
        <Section title="Organic Treatment" icon={Leaf} expanded>
          {e.organic_treatment && <div className="text-sm"><b>Organic:</b> {e.organic_treatment}</div>}
          {e.bio_control && <div className="text-sm mt-1"><b>Bio-control:</b> {e.bio_control}</div>}
          {e.natural_remedies && <div className="text-sm mt-1"><b>Natural remedies:</b> {e.natural_remedies}</div>}
        </Section>
      )}

      {/* Chemical */}
      {e.chemical_treatment?.product_name && (
        <Section title="Chemical Treatment" icon={Zap} expanded={expanded.chemical}
                 onToggle={() => setExpanded((s) => ({ ...s, chemical: !s.chemical }))}>
          <div className="space-y-1 text-sm">
            <ChemRow label="Product" value={e.chemical_treatment.product_name} />
            <ChemRow label="Active Ingredient" value={e.chemical_treatment.active_ingredient} />
            <ChemRow label="Dosage" value={e.chemical_treatment.dosage} />
            <ChemRow label="Water" value={e.chemical_treatment.water_quantity} />
            <ChemRow label="Spray Interval" value={e.chemical_treatment.spray_interval} />
            <ChemRow label="Max Applications" value={e.chemical_treatment.max_applications} />
            <ChemRow label="Waiting Period" value={e.chemical_treatment.waiting_period} />
          </div>
        </Section>
      )}

      {/* Spray Calculator */}
      {e.chemical_treatment?.dosage && (
        <SprayCalculator dosage={e.chemical_treatment.dosage} water={e.chemical_treatment.water_quantity} />
      )}

      {/* Products */}
      {products.length > 0 && (
        <div>
          <div className="font-display font-semibold text-sm mb-2">Recommended Products</div>
          <div className="space-y-2">
            {products.map((p) => (
              <div key={p.id} data-testid={`recommended-product-${p.id}`} className="card-surface p-3">
                <div className="flex gap-3">
                  <div className="w-16 h-16 rounded-lg bg-brand-bg flex-shrink-0 flex items-center justify-center overflow-hidden">
                    {p.image_path ? <img src={p.image_path} alt="" className="w-full h-full object-cover" /> :
                      <ShoppingBag size={22} className="text-brand-primary/40" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-[11px] text-brand-mute truncate">{p.packing}</div>
                    {!enquiryOnly && <div className="text-brand-primary font-mono text-sm mt-0.5">₹{p.price}</div>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <button data-testid={`view-product-${p.id}`} onClick={() => window.location.assign(`/t/${slug}/shop/catalogue`)}
                          className="text-xs py-1.5 rounded-lg border border-brand-line text-brand-mute">View</button>
                  <button data-testid={`enquire-product-${p.id}`} onClick={() => enquireProduct(p)}
                          className="text-xs py-1.5 rounded-lg border border-brand-secondary text-brand-secondary inline-flex items-center justify-center gap-1">
                    <MessageSquare size={11} /> Enquire
                  </button>
                  {!enquiryOnly ? (
                    <button data-testid={`buy-product-${p.id}`} onClick={() => buyProduct(p)}
                            className="text-xs py-1.5 rounded-lg bg-brand-primary text-white inline-flex items-center justify-center gap-1">
                      <ShoppingBag size={11} /> Buy
                    </button>
                  ) : (
                    <button data-testid={`locate-dealer-${p.id}`} onClick={() => toast.info("Contact your assigned employee to find nearest dealer.")}
                            className="text-xs py-1.5 rounded-lg border border-brand-line text-brand-mute inline-flex items-center justify-center gap-1">
                      <MapPin size={11} /> Locate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Safety */}
      {(e.safety?.ppe?.length || e.safety?.dos?.length || e.safety?.donts?.length) > 0 && (
        <Section title="Safety Instructions" icon={Shield} expanded={expanded.safety}
                 onToggle={() => setExpanded((s) => ({ ...s, safety: !s.safety }))}>
          {e.safety.ppe?.length > 0 && (
            <div className="text-sm"><b>PPE:</b> {e.safety.ppe.join(", ")}</div>
          )}
          {e.safety.dos?.length > 0 && (
            <div className="text-sm mt-2"><b>Do's:</b>
              <ul className="list-disc list-inside">{e.safety.dos.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {e.safety.donts?.length > 0 && (
            <div className="text-sm mt-2"><b>Don'ts:</b>
              <ul className="list-disc list-inside">{e.safety.donts.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {e.safety.first_aid && <div className="text-sm mt-2"><b>First Aid:</b> {e.safety.first_aid}</div>}
          {e.safety.storage && <div className="text-sm mt-1"><b>Storage:</b> {e.safety.storage}</div>}
        </Section>
      )}

      {/* Documents */}
      {e.documents?.length > 0 && (
        <Section title="Documents" icon={FileText} expanded>
          <div className="space-y-2">
            {e.documents.map((d, i) => (
              <a key={i} href={d.path} target="_blank" rel="noopener noreferrer"
                 className="flex items-center gap-2 p-2 rounded-lg border border-brand-line hover:bg-brand-bg text-sm">
                <FileText size={16} className="text-brand-primary" />
                <span className="flex-1 truncate">{d.name}</span>
                <span className="text-[10px] text-brand-mute uppercase">{d.doc_type}</span>
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* FAQs */}
      {e.faqs?.length > 0 && (
        <Section title="FAQs" icon={AlertCircle} expanded>
          <div className="space-y-2">
            {e.faqs.map((f, i) => (
              <details key={i} className="rounded-lg border border-brand-line p-2">
                <summary className="text-sm font-medium cursor-pointer">{f.q}</summary>
                <div className="text-sm mt-2 text-brand-mute">{f.a}</div>
              </details>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, expanded, onToggle, children }) {
  const collapsible = typeof onToggle === "function";
  return (
    <div className="card-surface p-3">
      <button
        type="button"
        onClick={collapsible ? onToggle : undefined}
        className={`w-full flex items-center gap-2 ${collapsible ? "cursor-pointer" : ""}`}
      >
        {Icon && <Icon size={16} className="text-brand-primary" />}
        <div className="font-display font-semibold text-sm flex-1 text-left">{title}</div>
        {collapsible && (expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
      </button>
      {expanded && <div className="mt-2">{children}</div>}
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className="text-brand-primary" />
      <div>
        <div className="text-[10px] text-brand-mute">{label}</div>
        <div>{value}</div>
      </div>
    </div>
  );
}

function ChemRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between border-b border-brand-line/50 py-1">
      <span className="text-brand-mute text-xs">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function SprayCalculator({ dosage, water }) {
  // dosage is a string like "0.6 g/L" — parse first numeric value
  const dosageVal = parseFloat(dosage) || 0;
  const dosageUnit = (dosage.match(/[a-zA-Z%\/]+/) || [""])[0];
  const [area, setArea] = useState(1);
  const [unit, setUnit] = useState("acre");
  const [waterPerAcre, setWaterPerAcre] = useState(200);

  const acres = unit === "acre" ? area : area * 2.47105;
  const totalWater = Math.round(acres * waterPerAcre);
  const totalDosage = (acres * waterPerAcre * dosageVal).toFixed(2);
  const bottles = dosageUnit.startsWith("g") ? Math.ceil(totalDosage / 250) : Math.ceil(totalDosage / 500);

  return (
    <Section title="Spray Calculator" icon={Calculator} expanded>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <Label className="text-xs">Area</Label>
          <Input data-testid="calc-area" type="number" value={area} onChange={(e) => setArea(+e.target.value || 0)} className="h-9" />
        </div>
        <div>
          <Label className="text-xs">Unit</Label>
          <select value={unit} onChange={(e) => setUnit(e.target.value)}
                  data-testid="calc-unit"
                  className="w-full h-9 rounded-lg border border-brand-line text-sm px-2 bg-white">
            <option value="acre">Acres</option>
            <option value="hectare">Hectares</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Water/Acre (L)</Label>
          <Input type="number" value={waterPerAcre} onChange={(e) => setWaterPerAcre(+e.target.value || 0)} className="h-9" />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <ResultTile label="Water" value={`${totalWater} L`} testid="calc-water" />
        <ResultTile label={`Product (${dosageUnit || "g/L"})`} value={totalDosage} testid="calc-dosage" />
        <ResultTile label="Approx bottles" value={bottles} testid="calc-bottles" />
      </div>
    </Section>
  );
}

function ResultTile({ label, value, testid }) {
  return (
    <div data-testid={testid} className="rounded-lg bg-brand-primary/5 border border-brand-primary/20 p-2 text-center">
      <div className="text-[10px] text-brand-mute">{label}</div>
      <div className="font-mono font-semibold text-brand-primary text-sm">{value}</div>
    </div>
  );
}
