import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Bell } from "lucide-react";
import { useApp } from "@/context/AppContext";

export default function Notifications() {
  const { t } = useApp();
  const [list, setList] = useState([]);
  useEffect(() => { api.get("/notifications").then(r => setList(r.data)); }, []);
  return (
    <div className="space-y-3">
      <h1 className="font-display text-xl font-bold">{t("notifications")}</h1>
      <div className="space-y-2">
        {list.map(n => (
          <div key={n.id} className="card-surface p-3 flex gap-3">
            <Bell className="text-brand-primary mt-0.5" size={18} />
            <div className="flex-1">
              <div className="font-medium text-sm">{n.title}</div>
              <div className="text-xs text-brand-mute">{n.body}</div>
              <div className="text-[10px] text-brand-mute mt-1">{new Date(n.created_at).toLocaleString("en-IN")}</div>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="text-center text-brand-mute py-8">{t("no_data")}</div>}
      </div>
    </div>
  );
}
