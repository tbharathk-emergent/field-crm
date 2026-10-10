import React from "react";

/**
 * Responsive page building blocks shared by every surface, so phone, tablet
 * and desktop compositions come from one place instead of per-page classes.
 */

/** Page title row: compact on phones, larger with right-aligned actions on desktop. */
export function PageHeader({ title, subtitle, eyebrow, children }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        {eyebrow && <div className="text-sm text-brand-mute">{eyebrow}</div>}
        <h1 className="font-display text-xl lg:text-3xl font-bold leading-tight">{title}</h1>
        {subtitle && <p className="text-brand-mute text-xs lg:text-sm mt-0.5">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  );
}

/**
 * Main column + side panel. Stacks on phones and tablets; from `xl` the side
 * panel sits beside the main column (there the desktop sidebar still leaves
 * the main column a comfortable width).
 */
export function Split({ children, aside, asideClassName = "" }) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-6 xl:items-start">
      <div className="min-w-0 space-y-4">{children}</div>
      <aside className={`min-w-0 space-y-4 ${asideClassName}`}>{aside}</aside>
    </div>
  );
}

/** Card with an optional heading row; the base surface for desktop panels. */
export function Panel({ title, action, children, className = "", bodyClassName = "p-4 lg:p-5" }) {
  return (
    <section className={`card-surface ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 px-4 lg:px-5 pt-4 lg:pt-5">
          <h2 className="font-display font-semibold text-sm lg:text-base">{title}</h2>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

const TH = "text-left font-medium text-xs uppercase tracking-wider text-brand-mute px-4 py-3 whitespace-nowrap";
const TD = "px-4 py-3 align-middle";

/**
 * Data table for wide screens. `columns` is [{ key, header, cell(row), align?, className? }].
 * Pair it with a card list for phones: <div className="lg:hidden">…</div>.
 */
export function DataTable({ columns, rows, rowKey = (r) => r.id, empty = "No data yet", onRowClick, testid }) {
  return (
    <div className="card-surface overflow-x-auto" data-testid={testid}>
      <table className="w-full text-sm">
        <thead className="border-b border-brand-line bg-brand-bg/60">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`${TH} ${c.align === "right" ? "text-right" : ""}`}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-line">
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={`hover:bg-brand-bg/50 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`${TD} ${c.align === "right" ? "text-right" : ""} ${c.className || ""}`}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-brand-mute">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_COLOR = {
  submitted: "#F39C12", approved: "#27AE60", packed: "#2980B9", dispatched: "#16A085",
  delivered: "#1ABC9C", cancelled: "#7F8C8D", rejected: "#E74C3C", draft: "#7F8C8D",
  new: "#2563EB", in_progress: "#F39C12", followup: "#8E44AD", closed: "#7F8C8D",
  pending: "#F39C12",
};

export function StatusBadge({ status }) {
  const color = STATUS_COLOR[status] || "#7F8C8D";
  return (
    <span
      className="inline-block text-[11px] tracking-wide px-2.5 py-1 rounded-full font-semibold capitalize whitespace-nowrap"
      style={{ background: `${color}1A`, color }}
    >
      {String(status || "").replace(/_/g, " ")}
    </span>
  );
}

export const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
