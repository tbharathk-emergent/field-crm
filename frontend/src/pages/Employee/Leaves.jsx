import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Plus, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, DataTable } from "@/components/Layout/Page";

const STATUS_COLOR = {
  pending: { bg: "#FEF3C7", fg: "#92400E", icon: Clock },
  approved: { bg: "#D1FAE5", fg: "#065F46", icon: CheckCircle2 },
  rejected: { bg: "#FEE2E2", fg: "#991B1B", icon: XCircle },
};

export default function EmpLeaves() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ leave_type: "casual", from_date: "", to_date: "", reason: "" });

  const load = () => api.get("/leaves", { params: { mine: true } }).then((r) => setList(r.data));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.from_date || !form.to_date) return toast.error("Pick dates");
    try {
      await api.post("/leaves", form);
      toast.success("Leave applied");
      setOpen(false);
      setForm({ leave_type: "casual", from_date: "", to_date: "", reason: "" });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const badge = (l) => {
    const sc = STATUS_COLOR[l.status] || STATUS_COLOR.pending;
    const Icon = sc.icon;
    return (
      <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full font-semibold inline-flex items-center gap-1 whitespace-nowrap"
            style={{ background: sc.bg, color: sc.fg }}>
        <Icon size={10} /> {l.status}
      </span>
    );
  };

  return (
    <div className="space-y-3 lg:space-y-5 pb-4">
      <PageHeader title="My Leaves" subtitle={list.length ? `${list.length} request${list.length === 1 ? "" : "s"}` : undefined}>
        <button data-testid="apply-leave-btn" onClick={() => setOpen(true)} className="btn-primary text-sm"><Plus size={14} /> <span>Apply<span className="hidden lg:inline"> for leave</span></span></button>
      </PageHeader>

      {/* Desktop: one table. Phones: a card per request. */}
      <div className="hidden lg:block">
        <DataTable
          testid="leaves-table"
          rows={list}
          empty="No leaves yet"
          columns={[
            { key: "type", header: "Type", cell: (l) => <span className="font-medium capitalize">{l.leave_type}</span> },
            { key: "dates", header: "Dates", cell: (l) => <span className="whitespace-nowrap">{l.from_date} → {l.to_date}</span> },
            { key: "days", header: "Days", align: "right", cell: (l) => <span className="font-mono">{l.days}</span> },
            { key: "reason", header: "Reason", cell: (l) => <span className="text-brand-mute">{l.reason || "—"}</span> },
            { key: "status", header: "Status", cell: badge },
            { key: "by", header: "Reviewed by", cell: (l) => l.approver_name
              ? <span className="text-brand-mute">{l.approver_name}{l.approver_comments ? ` · "${l.approver_comments}"` : ""}</span>
              : "—" },
          ]}
        />
      </div>

      <div className="space-y-2 lg:hidden">
        {list.map(l => (
          <div key={l.id} className="card-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium capitalize">{l.leave_type} leave</div>
                <div className="text-xs text-brand-mute">{l.from_date} → {l.to_date} ({l.days}d)</div>
                {l.reason && <div className="text-xs text-brand-mute mt-1">{l.reason}</div>}
              </div>
              {badge(l)}
            </div>
            {l.approver_name && (
              <div className="mt-2 pt-2 border-t border-brand-line text-[11px] text-brand-mute">
                by {l.approver_name}{l.approver_comments ? ` · "${l.approver_comments}"` : ""}
              </div>
            )}
          </div>
        ))}
        {list.length === 0 && <div className="text-center text-brand-mute py-8 text-sm">No leaves yet</div>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Apply for Leave</DialogTitle></DialogHeader>
          <div className="space-y-3 py-3">
            <div>
              <Label>Type</Label>
              <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="sick">Sick</SelectItem>
                  <SelectItem value="earned">Earned</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>From *</Label><Input type="date" data-testid="leave-from" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value })} /></div>
              <div><Label>To *</Label><Input type="date" data-testid="leave-to" value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} /></div>
            </div>
            <div><Label>Reason</Label><Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg border border-brand-line">Cancel</button>
            <button data-testid="submit-leave-btn" onClick={submit} className="btn-primary">Submit</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
