import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Leaves</h1>
          <p className="text-brand-mute text-sm mt-1">Approve or reject leave requests from your team.</p>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {view.map(l => {
          const sc = STATUS_COLOR[l.status] || STATUS_COLOR.pending;
          const Icon = sc.icon;
          return (
            <div key={l.id} className="card-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display font-semibold">{l.employee_name}</div>
                  <div className="text-xs text-brand-mute capitalize">{l.leave_type} · {l.days} day{l.days > 1 ? "s" : ""}</div>
                  <div className="text-sm mt-1">{l.from_date} → {l.to_date}</div>
                  {l.reason && <div className="text-xs text-brand-mute mt-1">{l.reason}</div>}
                </div>
                <span className="text-xs uppercase tracking-wider px-2 py-1 rounded-full font-semibold flex items-center gap-1"
                      style={{ background: sc.bg, color: sc.fg }}>
                  <Icon size={12} /> {l.status}
                </span>
              </div>
              {l.status === "pending" && (
                <div className="mt-3 flex gap-2">
                  <button data-testid={`approve-${l.id}`} onClick={() => setDecision({ leave: l, status: "approved" })}
                          className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg bg-emerald-600 text-white text-sm">
                    <CheckCircle2 size={14} /> Approve
                  </button>
                  <button data-testid={`reject-${l.id}`} onClick={() => setDecision({ leave: l, status: "rejected" })}
                          className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg border border-brand-line text-sm">
                    <XCircle size={14} /> Reject
                  </button>
                </div>
              )}
              {l.approver_name && (
                <div className="mt-2 pt-2 border-t border-brand-line text-xs text-brand-mute">
                  {l.status === "approved" ? "Approved" : "Rejected"} by {l.approver_name}
                  {l.approver_comments && <span className="block mt-0.5">"{l.approver_comments}"</span>}
                </div>
              )}
            </div>
          );
        })}
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
