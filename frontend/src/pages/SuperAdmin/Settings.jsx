import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Cloud, MessageCircle } from "lucide-react";

export default function Settings() {
  const [s, setS] = useState(null);

  useEffect(() => {
    api.get("/super/settings").then((r) => setS(r.data));
  }, []);

  const save = async () => {
    try {
      const res = await api.patch("/super/settings", s);
      setS(res.data);
      toast.success("Saved");
    } catch (e) {
      toast.error("Failed");
    }
  };

  if (!s) return <div className="text-brand-mute">Loading...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-3xl font-bold">Platform Settings</h1>
        <p className="text-brand-mute text-sm mt-1">Configure storage and SMS providers</p>
      </div>

      <div className="card-surface p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Cloud size={20} className="text-brand-primary" />
          <h2 className="font-display text-lg font-semibold">Object Storage</h2>
        </div>
        <p className="text-sm text-brand-mute">
          Currently using <strong>Emergent Object Storage</strong>. AWS S3 placeholder shown below — values are
          stored for future cutover.
        </p>
        <div className="flex items-center gap-3">
          <Switch checked={!!s.aws_s3_enabled} onCheckedChange={(v) => setS({ ...s, aws_s3_enabled: v })} />
          <Label>Enable AWS S3 (future)</Label>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Bucket</Label><Input value={s.aws_s3_bucket || ""} onChange={(e) => setS({ ...s, aws_s3_bucket: e.target.value })} /></div>
          <div><Label>Region</Label><Input value={s.aws_s3_region || ""} onChange={(e) => setS({ ...s, aws_s3_region: e.target.value })} /></div>
          <div><Label>Access Key</Label><Input value={s.aws_s3_access_key || ""} onChange={(e) => setS({ ...s, aws_s3_access_key: e.target.value })} /></div>
          <div><Label>Secret Key</Label><Input type="password" value={s.aws_s3_secret_key || ""} onChange={(e) => setS({ ...s, aws_s3_secret_key: e.target.value })} /></div>
        </div>
      </div>

      <div className="card-surface p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <MessageCircle size={20} className="text-brand-primary" />
          <h2 className="font-display text-lg font-semibold">SMS / WhatsApp Provider</h2>
        </div>
        <p className="text-sm text-brand-mute">
          Currently using <strong>Mock OTP</strong>. Pingbix integration placeholder below.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <Label>Provider</Label>
            <Input value={s.sms_provider || "mock"} onChange={(e) => setS({ ...s, sms_provider: e.target.value })} placeholder="mock | pingbix | twilio" />
          </div>
          <div><Label>API Key</Label><Input type="password" value={s.sms_api_key || ""} onChange={(e) => setS({ ...s, sms_api_key: e.target.value })} /></div>
          <div><Label>Sender ID</Label><Input value={s.sms_sender_id || ""} onChange={(e) => setS({ ...s, sms_sender_id: e.target.value })} /></div>
          <div className="flex items-center gap-3"><Switch checked={!!s.whatsapp_enabled} onCheckedChange={(v) => setS({ ...s, whatsapp_enabled: v })} /><Label>WhatsApp Enabled</Label></div>
        </div>
      </div>

      <button data-testid="save-settings-btn" onClick={save} className="btn-primary">Save Settings</button>
    </div>
  );
}
