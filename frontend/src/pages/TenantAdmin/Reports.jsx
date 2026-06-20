import React, { useState } from "react";
import { Download } from "lucide-react";
import { api } from "@/lib/api";

const RESOURCES = [
  { code: "users", label: "Users (Employees & Customers)" },
  { code: "products", label: "Products" },
  { code: "visits", label: "Visits" },
  { code: "sales", label: "Sales" },
  { code: "collections", label: "Collections" },
  { code: "attendance", label: "Attendance" },
  { code: "enquiries", label: "Enquiries" },
  { code: "orders", label: "Orders" },
  { code: "dcr", label: "DCR" },
];

export default function Reports() {
  const dl = (resource, fmt) => {
    const token = localStorage.getItem("fc_token");
    window.open(`${api.defaults.baseURL}/export/${resource}?fmt=${fmt}&auth=${token}`, "_blank");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Reports</h1>
        <p className="text-brand-mute text-sm mt-1">Export tenant data in Excel or CSV.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {RESOURCES.map((r) => (
          <div key={r.code} className="card-surface p-5">
            <div className="font-display font-semibold capitalize">{r.label}</div>
            <div className="text-xs text-brand-mute mb-3 mt-1">Latest tenant-scoped records</div>
            <div className="flex gap-2">
              <button data-testid={`export-${r.code}-xlsx`} onClick={() => dl(r.code, "xlsx")}
                className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg bg-brand-primary text-white text-sm">
                <Download size={14} /> Excel
              </button>
              <button onClick={() => dl(r.code, "csv")}
                className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg border border-brand-line text-sm">
                <Download size={14} /> CSV
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
