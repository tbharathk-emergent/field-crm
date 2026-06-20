import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { useApp, getLabel } from "@/context/AppContext";

export default function Catalogue() {
  const { tenant, t } = useApp();
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");
  useEffect(() => { api.get("/tenant/products").then(r => setList(r.data)); }, []);
  const view = list.filter(p => !search || `${p.name} ${p.code || ""} ${p.category || ""}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="space-y-3">
      <h1 className="font-display text-xl font-bold">{getLabel(tenant, "product_plural", "Catalogue")}</h1>
      <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        {view.map(p => (
          <div key={p.id} className="card-surface p-3">
            <div className="aspect-square bg-brand-bg rounded-lg mb-2 flex items-center justify-center text-2xl font-display font-bold text-brand-primary/40">{p.name?.[0]}</div>
            <div className="font-medium text-sm truncate">{p.name}</div>
            <div className="text-xs text-brand-mute">{p.packing}</div>
            <div className="font-mono font-semibold text-brand-primary mt-1">₹{p.price}</div>
          </div>
        ))}
        {view.length === 0 && <div className="col-span-2 text-center text-brand-mute py-8">{t("no_data")}</div>}
      </div>
    </div>
  );
}
