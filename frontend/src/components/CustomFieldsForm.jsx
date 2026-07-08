import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * <CustomFieldsForm module="dealer" data={form.custom_data || {}} onChange={(cd) => setForm({...form, custom_data: cd})} />
 * Fetches tenant custom fields for the given module and renders inputs.
 * For customer PWA self-signup pass `viewerRole="customer"` to filter to visible-to-customer only.
 */
export default function CustomFieldsForm({ module, data = {}, onChange, viewerRole = null, compact = false }) {
  const [fields, setFields] = useState([]);

  useEffect(() => {
    if (!module) return;
    api.get(`/custom-fields`, { params: { module } })
      .then((r) => setFields(r.data || []))
      .catch(() => setFields([]));
  }, [module]);

  const filtered = viewerRole === "customer" || viewerRole === "dealer"
    ? fields.filter(f => f.visible_to_customer !== false)
    : fields;

  if (!filtered.length) return null;

  const setVal = (key, val) => onChange({ ...data, [key]: val });
  const toggleCheck = (key, opt) => {
    const cur = Array.isArray(data[key]) ? data[key] : [];
    const next = cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt];
    setVal(key, next);
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {filtered.map((f) => {
        const val = data[f.field_key];
        const key = f.field_key;
        return (
          <div key={f.id} data-testid={`cf-field-${key}`}>
            <Label>{f.label}{f.required && <span className="text-red-500"> *</span>}</Label>
            {f.help_text && <div className="text-[11px] text-brand-mute mt-0.5">{f.help_text}</div>}

            {f.type === "text" && (
              <Input data-testid={`cf-${key}`} value={val || ""} placeholder={f.placeholder || ""}
                     onChange={(e) => setVal(key, e.target.value)} />
            )}
            {f.type === "number" && (
              <Input data-testid={`cf-${key}`} type="number" value={val ?? ""} placeholder={f.placeholder || ""}
                     onChange={(e) => setVal(key, e.target.value === "" ? "" : +e.target.value)} />
            )}
            {f.type === "textarea" && (
              <Textarea data-testid={`cf-${key}`} value={val || ""} rows={3} placeholder={f.placeholder || ""}
                        onChange={(e) => setVal(key, e.target.value)} />
            )}
            {f.type === "date" && (
              <Input data-testid={`cf-${key}`} type="date" value={val || ""}
                     onChange={(e) => setVal(key, e.target.value)} />
            )}
            {f.type === "dropdown" && (
              <Select value={val || ""} onValueChange={(v) => setVal(key, v)}>
                <SelectTrigger data-testid={`cf-${key}`}><SelectValue placeholder={f.placeholder || "Select"} /></SelectTrigger>
                <SelectContent>
                  {f.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {f.type === "radio" && (
              <div className="flex flex-wrap gap-2 mt-1" data-testid={`cf-${key}`}>
                {f.options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setVal(key, o)}
                    className={`px-3 py-1.5 rounded-full border text-xs font-medium transition ${
                      val === o ? "bg-brand-primary text-white border-brand-primary" : "border-brand-line text-brand-mute"
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}
            {f.type === "checkbox" && (
              <div className="flex flex-col gap-1.5 mt-1" data-testid={`cf-${key}`}>
                {f.options.map((o) => {
                  const arr = Array.isArray(val) ? val : [];
                  return (
                    <label key={o} className="inline-flex items-center gap-2 text-sm">
                      <Checkbox checked={arr.includes(o)} onCheckedChange={() => toggleCheck(key, o)} />
                      <span>{o}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Validate that all required fields in the data object are non-empty.
 * Returns error message or null.
 */
export function validateCustomFields(fields, data) {
  for (const f of fields) {
    if (!f.required) continue;
    const v = data?.[f.field_key];
    const empty =
      v === undefined || v === null || v === "" ||
      (Array.isArray(v) && v.length === 0);
    if (empty) return `${f.label} is required`;
  }
  return null;
}
