import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Bell } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { PageHeader } from "@/components/Layout/Page";

export default function Notifications() {
  const { t } = useApp();
  const [list, setList] = useState([]);
  useEffect(() => { api.get("/notifications").then(r => setList(r.data)); }, []);
  return (
    <div className="space-y-3 lg:space-y-5">
      <PageHeader title={t("notifications")} subtitle={list.length ? `${list.length} total` : undefined} />
      {list.length === 0 ? (
        <div className="card-surface p-8 lg:p-16 text-center text-brand-mute">
          <Bell className="mx-auto mb-2 text-brand-mute" size={32} />
          {t("no_data")}
        </div>
      ) : (
        /* One card per notice on phones; a single divided feed on desktop. */
        <div className="space-y-2 lg:space-y-0 lg:card-surface lg:divide-y lg:divide-brand-line">
          {list.map(n => (
            <div key={n.id} className="card-surface p-3 flex gap-3 lg:rounded-none lg:border-0 lg:shadow-none lg:bg-transparent lg:px-5 lg:py-4">
              <Bell className="text-brand-primary mt-0.5 shrink-0" size={18} />
              <div className="flex-1 min-w-0 lg:flex lg:items-start lg:justify-between lg:gap-6">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{n.title}</div>
                  <div className="text-xs lg:text-sm text-brand-mute">{n.body}</div>
                </div>
                <div className="text-[10px] lg:text-xs text-brand-mute mt-1 lg:mt-0 whitespace-nowrap">{new Date(n.created_at).toLocaleString("en-IN")}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
