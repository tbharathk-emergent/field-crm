import React, { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw, CloudOff } from "lucide-react";
import { api } from "@/lib/api";
import { queueCount, syncQueue } from "@/lib/offline";
import { toast } from "sonner";

export default function OfflineIndicator() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = async () => setPending(await queueCount());

  useEffect(() => {
    refresh();
    const on = () => { setOnline(true); doSync(); };
    const off = () => setOnline(false);
    const changed = () => refresh();
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("fc:queue:changed", changed);
    const iv = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("fc:queue:changed", changed);
      clearInterval(iv);
    };
    // eslint-disable-next-line
  }, []);

  const doSync = async () => {
    setSyncing(true);
    try {
      const res = await syncQueue(api);
      if (res.ok && res.synced > 0) toast.success(`Synced ${res.synced} entries`);
      else if (!res.ok && res.reason && res.reason !== "offline") toast.error(`Sync: ${res.reason}`);
    } finally {
      setSyncing(false);
      refresh();
    }
  };

  if (online && pending === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border"
      style={{
        background: online ? "#FEF3C7" : "#FEE2E2",
        color: online ? "#92400E" : "#991B1B",
        borderColor: online ? "#FCD34D" : "#FCA5A5",
      }}>
      {online ? <CloudOff size={14} /> : <WifiOff size={14} />}
      <span>
        {!online && "Offline · "}
        {pending > 0 ? `${pending} pending` : "Online"}
      </span>
      {online && pending > 0 && (
        <button data-testid="sync-now-btn" onClick={doSync} disabled={syncing}
                className="ml-1 inline-flex items-center gap-1 underline">
          <RefreshCw size={12} className={syncing ? "animate-spin" : ""} /> Sync
        </button>
      )}
    </div>
  );
}
