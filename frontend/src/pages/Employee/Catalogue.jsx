import React, { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { api, fileUrl } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { useApp, getLabel } from "@/context/AppContext";
import { PageHeader } from "@/components/Layout/Page";

export default function Catalogue() {
  const { tenant, t } = useApp();
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(null);
  useEffect(() => { api.get("/tenant/products").then(r => setList(r.data)); }, []);

  const categories = useMemo(() => [...new Set(list.map(p => p.category).filter(Boolean))].sort(), [list]);
  const view = list.filter(p =>
    (!category || p.category === category) &&
    (!search || `${p.name} ${p.code || ""} ${p.category || ""}`.toLowerCase().includes(search.toLowerCase())));

  const searchBox = (
    <div className="relative">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-mute pointer-events-none" />
      <Input className="pl-9" placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
    </div>
  );

  const chip = (label, value) => (
    <button
      key={label}
      onClick={() => setCategory(value)}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition ${
        category === value ? "bg-brand-primary text-white border-brand-primary" : "bg-white border-brand-line text-brand-ink hover:bg-brand-bg"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3 lg:space-y-5">
      <PageHeader
        title={getLabel(tenant, "product_plural", "Catalogue")}
        subtitle={list.length ? `${view.length} of ${list.length} shown` : undefined}
      >
        <div className="hidden lg:block w-72">{searchBox}</div>
      </PageHeader>
      <div className="lg:hidden">{searchBox}</div>

      {categories.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-visible" data-testid="category-filter">
          {chip("All", null)}
          {categories.map(c => chip(c, c))}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3 lg:gap-4">
        {view.map(p => (
          <div key={p.id} className="card-surface p-3">
            <div className="aspect-square bg-brand-bg rounded-lg mb-2 flex items-center justify-center overflow-hidden text-2xl font-display font-bold text-brand-primary/40">
              {p.image_path ? <img src={fileUrl(p.image_path)} alt={p.name} className="w-full h-full object-cover" /> : p.name?.[0]}
            </div>
            <div className="font-medium text-sm truncate" title={p.name}>{p.name}</div>
            <div className="text-xs text-brand-mute truncate">{p.packing}</div>
            <div className="font-mono font-semibold text-brand-primary mt-1">₹{p.price}</div>
          </div>
        ))}
        {view.length === 0 && <div className="col-span-full text-center text-brand-mute py-8">{t("no_data")}</div>}
      </div>
    </div>
  );
}
