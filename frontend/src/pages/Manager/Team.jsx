import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/context/AppContext";

export default function Team() {
  const { t } = useApp();
  const [list, setList] = useState([]);
  useEffect(() => { api.get("/tenant/users", { params: { role: "employee" } }).then(r => setList(r.data)); }, []);
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold">My Team</h1>
      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-brand-bg text-xs uppercase tracking-wider text-brand-mute">
            <tr>
              <th className="text-left px-4 py-3">Name</th>
              <th className="text-left px-4 py-3">Phone</th>
              <th className="text-left px-4 py-3">Code</th>
              <th className="text-left px-4 py-3">Area</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-line">
            {list.map(u => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{u.phone}</td>
                <td className="px-4 py-3">{u.employee_code || "—"}</td>
                <td className="px-4 py-3 text-brand-mute">{u.area || "—"}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan="4" className="text-center py-8 text-brand-mute">{t("no_data")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
