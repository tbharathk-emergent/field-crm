import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, DataTable } from "@/components/Layout/Page";

const STATUS_COLOR = {
  pending: { bg: "#FEF3C7", fg: "#92400E", icon: Clock },
  approved: { bg: "#D1FAE5", fg: "#065F46", icon: CheckCircle2 },
  rejected: { bg: "#FEE2E2", fg: "#991B1B", icon: XCircle },
  cancelled: { bg: "#E5E7EB", fg: "#374151", icon: XCircle },
};

export default function Leaves() {
  const [list, setList] = useState([]);
  const [status, setStatus] = useState("all");
  const [decision, setDecision] = useState(null); // { leave, status }
  const [comments, setComments] = useState("");

  const load = () => {
    const params = status === "all" ? {} : { status };
    api.get("/leaves", { params }).then((r) => setList(r.data));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status]);

  const view = list;
  const decide = async () => {
    try {
      await api.patch(`/leaves/${decision.leave.id}`, { status: decision.status, comments });
      toast.success(decision.status === "approved" ? "Approved" : "Rejected");
      setDecision(null); setComments(""); load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    }
  };

  const badge = (l) => {
    const sc = STATUS_COLOR[l.status] || STATUS_COLOR.pending;
    const Icon = sc.icon;
    return (
      <span className="text-xs uppercase tracking-wider px-2 py-1 rounded-full font-semibold inline-flex items-center gap-1 whitespace-nowrap"
            style={{ background: sc.bg, color: sc.fg }}>
        <Icon size={12} /> {l.status}
      </span>
    );
  };
  const actions = (l, grow = "") => l.status === "pending" && (
    <div className="flex gap-2">
      <button data-testid={`approve-${l.id}`} onClick={() => setDecision({ leave: l, status: "approved" })}
              className={`${grow} inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700`}>
        <CheckCircle2 size={14} /> Approve
      </button>
      <button data-testid={`reject-${l.id}`} onClick={() => setDecision({ leave: l, status: "rejected" })}
              className={`${grow} inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-brand-line text-sm hover:bg-brand-bg`}>
        <XCircle size={14} /> Reject
      </button>
    </div>
  );

  return (
    <div className="space-y-4 lg:space-y-6">
      <PageHeader title="Leaves" subtitle="Approve or reject leave requests from your team.">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44" data-testid="leaves-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {/* Desktop: one table. Phones and tablets: a card per request. */}
      <div className="hidden xl:block">
        <DataTable
          testid="admin-leaves-table"
          rows={view}
          empty="No leave requests"
          columns={[
            { key: "who", header: "Employee", cell: (l) => <span className="font-medium">{l.employee_name}</span> },
            { key: "type", header: "Type", cell: (l) => <span className="capitalize">{l.leave_type}</span> },
            { key: "dates", header: "Dates", cell: (l) => <span className="whitespace-nowrap">{l.from_date} → {l.to_date}</span> },
            { key: "days", header: "Days", align: "right", cell: (l) => <span className="font-mono">{l.days}</span> },
            { key: "reason", header: "Reason", className: "max-w-xs", cell: (l) => <span className="text-brand-mute">{l.reason || "—"}</span> },
            { key: "status", header: "Status", cell: badge },
            { key: "decision", header: "Decision", cell: (l) => l.status === "pending"
              ? actions(l)
              : l.approver_name
                ? <span className="text-xs text-brand-mute">by {l.approver_name}{l.approver_comments ? ` · "${l.approver_comments}"` : ""}</span>
                : "—" },
          ]}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4 xl:hidden">
        {view.map(l => (
          <div key={l.id} className="card-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-display font-semibold">{l.employee_name}</div>
                <div className="text-xs text-brand-mute capitalize">{l.leave_type} · {l.days} day{l.days > 1 ? "s" : ""}</div>
                <div className="text-sm mt-1">{l.from_date} → {l.to_date}</div>
                {l.reason && <div className="text-xs text-brand-mute mt-1">{l.reason}</div>}
              </div>
              {badge(l)}
            </div>
            {l.status === "pending" && <div className="mt-3">{actions(l, "flex-1")}</div>}
            {l.approver_name && (
              <div className="mt-2 pt-2 border-t border-brand-line text-xs text-brand-mute">
                {l.status === "approved" ? "Approved" : "Rejected"} by {l.approver_name}
                {l.approver_comments && <span className="block mt-0.5">"{l.approver_comments}"</span>}
              </div>
            )}
          </div>
        ))}
        {view.length === 0 && <div className="col-span-full text-center text-brand-mute py-12">No leave requests</div>}
      </div>

      <Dialog open={!!decision} onOpenChange={(v) => !v && setDecision(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{decision?.status === "approved" ? "Approve" : "Reject"} Leave</DialogTitle></DialogHeader>
          <div className="py-3 space-y-3">
            <div className="text-sm">
              <div className="font-medium">{decision?.leave?.employee_name}</div>
              <div className="text-brand-mute text-xs">{decision?.leave?.from_date} → {decision?.leave?.to_date} ({decision?.leave?.days}d)</div>
            </div>
            <div>
              <label className="label-up block mb-1">Comments (optional)</label>
              <Textarea rows={2} value={comments} onChange={(e) => setComments(e.target.value)} data-testid="decision-comments" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setDecision(null)} className="px-4 py-2 rounded-lg border border-brand-line">Cancel</button>
            <button data-testid="confirm-decision-btn" onClick={decide} className="btn-primary">Confirm</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
