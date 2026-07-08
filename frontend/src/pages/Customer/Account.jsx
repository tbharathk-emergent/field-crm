import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { LogOut, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/context/AppContext";
import CustomFieldsForm from "@/components/CustomFieldsForm";

export default function Account() {
  const { user, tenant, t, logout, refreshMe } = useApp();
  const navigate = useNavigate();
  const [profile, setProfile] = useState({
    name: user?.name || "",
    email: user?.email || "",
    business_name: user?.business_name || "",
    address: user?.address || "",
    village: user?.village || "",
    district: user?.district || "",
    state: user?.state || "",
    pincode: user?.pincode || "",
    farm_size_acres: user?.farm_size_acres || 0,
    crops: user?.crops || "",
    custom_data: user?.custom_data || {},
  });
  const [saving, setSaving] = useState(false);
  const [enq, setEnq] = useState({ customer_name: user?.name || "", mobile: user?.phone || "", category: "", description: "" });

  useEffect(() => {
    if (user) setProfile((p) => ({ ...p, custom_data: user.custom_data || p.custom_data }));
  }, [user]);

  const isFarmer = user?.role === "customer";
  const cfModule = user?.role === "dealer" ? "dealer" : "customer";

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.patch("/me/profile", profile);
      if (refreshMe) await refreshMe();
      toast.success("Profile updated");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setSaving(false); }
  };

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
        {user?.dealer_code && (
          <div className="text-xs text-brand-mute">{user?.business_name} · {user?.dealer_code}</div>
        )}
      </div>

      {user?.role === "dealer" && (
        <div className="card-surface p-4 space-y-2">
          <h2 className="font-display font-semibold text-sm mb-2">Account Summary</h2>
          <div className="flex justify-between text-sm"><span className="text-brand-mute">Credit Limit</span><span className="font-mono">₹{(user?.credit_limit || 0).toLocaleString("en-IN")}</span></div>
          <div className="flex justify-between text-sm"><span className="text-brand-mute">Outstanding</span><span className="font-mono text-brand-error">₹{(user?.outstanding_amount || 0).toLocaleString("en-IN")}</span></div>
          <div className="flex justify-between text-sm font-semibold pt-2 border-t border-brand-line">
            <span>Available Credit</span>
            <span className="font-mono text-brand-primary">₹{((user?.credit_limit || 0) - (user?.outstanding_amount || 0)).toLocaleString("en-IN")}</span>
          </div>
        </div>
      )}

      {/* Editable profile */}
      <div className="card-surface p-4 space-y-3">
        <h2 className="font-display font-semibold text-sm">My Profile</h2>
        <div><Label>Full Name</Label><Input data-testid="profile-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></div>
        <div><Label>Email</Label><Input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></div>
        {!isFarmer && <div><Label>Business Name</Label><Input value={profile.business_name} onChange={(e) => setProfile({ ...profile, business_name: e.target.value })} /></div>}
        <div><Label>Address</Label><Input value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Village</Label><Input value={profile.village} onChange={(e) => setProfile({ ...profile, village: e.target.value })} /></div>
          <div><Label>District</Label><Input value={profile.district} onChange={(e) => setProfile({ ...profile, district: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>State</Label><Input value={profile.state} onChange={(e) => setProfile({ ...profile, state: e.target.value })} /></div>
          <div><Label>Pincode</Label><Input value={profile.pincode} onChange={(e) => setProfile({ ...profile, pincode: e.target.value })} /></div>
        </div>
        {isFarmer && (
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Farm (acres)</Label><Input type="number" step="0.1" value={profile.farm_size_acres} onChange={(e) => setProfile({ ...profile, farm_size_acres: +e.target.value })} /></div>
            <div><Label>Crops</Label><Input value={profile.crops} onChange={(e) => setProfile({ ...profile, crops: e.target.value })} placeholder="Cotton, Paddy" /></div>
          </div>
        )}
        <div className="pt-2 border-t border-brand-line">
          <div className="text-xs text-brand-mute mb-2 uppercase tracking-wider">Additional Details</div>
          <CustomFieldsForm module={cfModule} data={profile.custom_data} viewerRole={user?.role}
                            onChange={(cd) => setProfile({ ...profile, custom_data: cd })} />
        </div>
        <button data-testid="save-profile-btn" onClick={saveProfile} disabled={saving}
                className="btn-primary w-full inline-flex items-center justify-center gap-2">
          <Save size={16} /> {saving ? "..." : "Save Profile"}
        </button>
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
