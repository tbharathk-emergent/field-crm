import React, { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp, getLabel } from "@/context/AppContext";

export default function Account() {
  const { user, tenant, t, logout } = useApp();
  const navigate = useNavigate();
  const [enq, setEnq] = useState({ customer_name: user?.name || "", mobile: user?.phone || "", category: "", description: "" });

  const sendEnq = async () => {
    if (!enq.description) return toast.error("Describe your request");
    try {
      await api.post("/enquiries", { ...enq, source: "customer" });
      toast.success("Enquiry sent");
      setEnq({ ...enq, category: "", description: "" });
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-3 pb-4">
      <h1 className="font-display text-xl font-bold">{t("account")}</h1>

      <div className="card-surface p-5 text-center">
        <div className="w-20 h-20 rounded-full mx-auto bg-brand-primary text-white font-display text-2xl font-bold flex items-center justify-center">
          {user?.name?.[0] || "C"}
        </div>
        <div className="font-display font-semibold mt-3">{user?.name}</div>
        <div className="text-xs text-brand-mute">{user?.phone}</div>
        <div className="text-xs text-brand-mute">{user?.business_name} · {user?.dealer_code}</div>
      </div>

      <div className="card-surface p-4 space-y-2">
        <h2 className="font-display font-semibold text-sm mb-2">Account Summary</h2>
        <div className="flex justify-between text-sm"><span className="text-brand-mute">Credit Limit</span><span className="font-mono">₹{(user?.credit_limit || 0).toLocaleString("en-IN")}</span></div>
        <div className="flex justify-between text-sm"><span className="text-brand-mute">Outstanding</span><span className="font-mono text-brand-error">₹{(user?.outstanding_amount || 0).toLocaleString("en-IN")}</span></div>
        <div className="flex justify-between text-sm font-semibold pt-2 border-t border-brand-line">
          <span>Available Credit</span>
          <span className="font-mono text-brand-primary">₹{((user?.credit_limit || 0) - (user?.outstanding_amount || 0)).toLocaleString("en-IN")}</span>
        </div>
      </div>

      <div className="card-surface p-4 space-y-3">
        <h2 className="font-display font-semibold text-sm">Raise an Enquiry</h2>
        <div><Label>Category</Label><Input value={enq.category} onChange={(e) => setEnq({ ...enq, category: e.target.value })} placeholder="e.g. Product issue, Crop help" /></div>
        <div><Label>Describe</Label><Textarea value={enq.description} onChange={(e) => setEnq({ ...enq, description: e.target.value })} rows={3} /></div>
        <button onClick={sendEnq} className="btn-primary w-full">Send</button>
      </div>

      <button onClick={() => { logout(); navigate("/"); }} className="btn-secondary w-full">
        <LogOut size={16} /> {t("logout")}
      </button>
    </div>
  );
}
