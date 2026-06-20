import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Announcements() {
  const [form, setForm] = useState({ title: "", body: "", role: "employee", type: "announcement" });
  const [list, setList] = useState([]);

  const load = () => api.get("/notifications").then((r) => setList(r.data));
  useEffect(() => { load(); }, []);

  const send = async () => {
    if (!form.title || !form.body) return toast.error("Title & message required");
    try {
      await api.post("/notifications", form);
      toast.success("Sent");
      setForm({ ...form, title: "", body: "" });
      load();
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-3xl font-bold">Announcements</h1>
        <p className="text-brand-mute text-sm mt-1">Broadcast to your team or customers.</p>
      </div>
      <div className="card-surface p-5 space-y-3">
        <div><Label>Title</Label><Input data-testid="ann-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
        <div><Label>Message</Label><Textarea data-testid="ann-body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={3} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Audience</Label>
            <Select value={form.role || ""} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">All Employees</SelectItem>
                <SelectItem value="manager">Managers</SelectItem>
                <SelectItem value="customer">All Customers</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="announcement">Announcement</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <button data-testid="send-ann-btn" onClick={send} className="btn-primary"><Send size={14} /> Send</button>
      </div>

      <div className="card-surface p-5">
        <h2 className="font-display font-semibold mb-3">Recent</h2>
        <div className="divide-y divide-brand-line">
          {list.slice(0, 20).map((n) => (
            <div key={n.id} className="py-3">
              <div className="font-medium">{n.title}</div>
              <div className="text-sm text-brand-mute">{n.body}</div>
              <div className="text-xs text-brand-mute mt-1">{new Date(n.created_at).toLocaleString("en-IN")} · {n.role || "all"}</div>
            </div>
          ))}
          {list.length === 0 && <div className="py-6 text-center text-brand-mute text-sm">No announcements yet</div>}
        </div>
      </div>
    </div>
  );
}
