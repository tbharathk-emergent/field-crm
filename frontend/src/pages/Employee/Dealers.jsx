import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApp, getLabel } from "@/context/AppContext";
import { Input } from "@/components/ui/input";
import { Phone, MapPin } from "lucide-react";

export default function Dealers() {
  const { user, tenant, t } = useApp();
  const [list, setList] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const params = { role: "customer" };
    if (user?.role === "employee") params.assigned_employee_id = user.id;
    api.get("/tenant/users", { params }).then(r => setList(r.data));
  }, [user]);

  const view = list.filter(u => !search || `${u.name} ${u.phone} ${u.dealer_code || ""} ${u.business_name || ""}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-3">
      <h1 className="font-display text-xl font-bold">{getLabel(tenant, "dealer_plural", "My Dealers")}</h1>
      <Input placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="space-y-2">
        {view.map(u => (
          <div key={u.id} className="card-surface p-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display font-semibold">{u.name}</div>
                <div className="text-xs text-brand-mute">{u.business_name} · {u.dealer_code}</div>
                <div className="text-xs text-brand-mute flex items-center gap-1 mt-1"><MapPin size={12} /> {u.village}, {u.district}</div>
              </div>
              <a href={`tel:${u.phone}`} className="w-9 h-9 rounded-full bg-brand-primary text-white flex items-center justify-center"><Phone size={14} /></a>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-brand-mute">Outstanding</span>
              <span className="font-mono font-semibold">₹{(u.outstanding_amount || 0).toLocaleString("en-IN")}</span>
            </div>
          </div>
        ))}
        {view.length === 0 && <div className="text-center text-brand-mute py-8">{t("no_data")}</div>}
      </div>
    </div>
  );
}
