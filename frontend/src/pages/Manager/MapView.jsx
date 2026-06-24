import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, CircleMarker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Radio, Clock, MapPin as MapPinIcon } from "lucide-react";

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export default function MapView() {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [track, setTrack] = useState(null);
  const [liveItems, setLiveItems] = useState([]);
  const [mode, setMode] = useState("history"); // history | live

  useEffect(() => {
    api.get("/tenant/users", { params: { role: "employee,manager" } }).then(r => {
      setEmployees(r.data);
      if (r.data[0]) setEmployeeId(r.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (mode !== "history" || !employeeId) return;
    api.get("/gps/track", { params: { user_id: employeeId, date } }).then(r => setTrack(r.data));
  }, [mode, employeeId, date]);

  useEffect(() => {
    if (mode !== "live") return;
    const load = () => api.get("/gps/live").then(r => setLiveItems(r.data.items || []));
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [mode]);

  const center = (() => {
    if (mode === "live" && liveItems[0]) return [liveItems[0].lat, liveItems[0].lng];
    if (track?.pings?.[0]) return [track.pings[0].lat, track.pings[0].lng];
    return [17.385, 78.4867];
  })();
  const path = (track?.pings || []).map(p => [p.lat, p.lng]);
  const stops = track?.stops || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-3xl font-bold">GPS Tracking</h1>
        <div className="flex gap-2">
          <div className="flex rounded-xl border border-brand-line overflow-hidden">
            <button data-testid="mode-history" onClick={() => setMode("history")}
              className={`px-3 py-1.5 text-xs font-medium ${mode === "history" ? "bg-brand-primary text-white" : "bg-white text-brand-ink"}`}>History</button>
            <button data-testid="mode-live" onClick={() => setMode("live")}
              className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 ${mode === "live" ? "bg-brand-secondary text-white" : "bg-white text-brand-ink"}`}>
              <Radio size={12} /> Live
            </button>
          </div>
          {mode === "history" && (
            <>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Employee" /></SelectTrigger>
                <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
            </>
          )}
        </div>
      </div>

      {mode === "history" && track && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card-surface p-3">
            <div className="label-up">Pings</div>
            <div className="font-display text-2xl font-bold">{track.pings.length}</div>
          </div>
          <div className="card-surface p-3">
            <div className="label-up">Stops</div>
            <div className="font-display text-2xl font-bold">{stops.length}</div>
          </div>
          <div className="card-surface p-3">
            <div className="label-up">Distance</div>
            <div className="font-display text-2xl font-bold">{(track.distance_m / 1000).toFixed(1)} km</div>
          </div>
          <div className="card-surface p-3">
            <div className="label-up">Visits</div>
            <div className="font-display text-2xl font-bold">{stops.reduce((s, x) => s + (x.activities?.length || 0), 0)}</div>
          </div>
        </div>
      )}

      <div className="card-surface p-2 h-[520px]">
        <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }}>
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {mode === "live" && liveItems.map(it => (
            <Marker key={it.user_id} position={[it.lat, it.lng]}>
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold">{it.user_name}</div>
                  <div>Last seen: {fmtTime(it.timestamp)}</div>
                  <div>Checked in: {fmtTime(it.check_in_at)}</div>
                </div>
              </Popup>
            </Marker>
          ))}

          {mode === "history" && (
            <>
              {path.length > 1 && <Polyline positions={path} pathOptions={{ color: "var(--brand-primary)", weight: 3, opacity: 0.7 }} />}
              {stops.map((s, i) => {
                const hasActivity = (s.activities || []).length > 0;
                const radius = Math.max(8, Math.min(24, 8 + Math.log10(Math.max(1, s.duration_min)) * 8));
                return (
                  <CircleMarker key={i} center={[s.lat, s.lng]} radius={radius}
                                pathOptions={{
                                  color: hasActivity ? "#D35400" : "#2C5E43",
                                  fillColor: hasActivity ? "#E67E22" : "#27AE60",
                                  fillOpacity: 0.6, weight: 2,
                                }}>
                    <Popup>
                      <div className="text-xs space-y-1">
                        <div className="font-semibold flex items-center gap-1"><Clock size={10} /> {s.duration_min} min stop</div>
                        <div>{fmtTime(s.start)} – {fmtTime(s.end)}</div>
                        {hasActivity && (
                          <div className="pt-1 border-t border-gray-200">
                            <div className="font-medium text-[#D35400]">Activities:</div>
                            {s.activities.map((a, j) => <div key={j}>• {a.title}</div>)}
                          </div>
                        )}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </>
          )}
        </MapContainer>
      </div>

      {mode === "live" && (
        <div className="card-surface p-4">
          <h2 className="font-display font-semibold mb-2">Currently Checked-in ({liveItems.length})</h2>
          <div className="space-y-2">
            {liveItems.map(it => (
              <div key={it.user_id} className="flex items-center justify-between py-2 border-b border-brand-line last:border-0">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-medium text-sm">{it.user_name}</span>
                </div>
                <div className="text-xs text-brand-mute">last ping {fmtTime(it.timestamp)}</div>
              </div>
            ))}
            {liveItems.length === 0 && <div className="text-sm text-brand-mute text-center py-4">No employees checked in right now</div>}
          </div>
        </div>
      )}

      {mode === "history" && stops.length > 0 && (
        <div className="card-surface p-4">
          <h2 className="font-display font-semibold mb-2">Stops Timeline</h2>
          <div className="space-y-2">
            {stops.map((s, i) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b border-brand-line last:border-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: (s.activities?.length > 0) ? "#E67E22" : "#2C5E4310", color: (s.activities?.length > 0) ? "#fff" : "#2C5E43" }}>
                  <MapPinIcon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{fmtTime(s.start)} – {fmtTime(s.end)} · {s.duration_min} min</div>
                  {(s.activities || []).length > 0 && (
                    <div className="text-xs text-brand-secondary font-semibold">
                      {s.activities.map(a => a.title).join(", ")}
                    </div>
                  )}
                  <div className="text-[10px] text-brand-mute font-mono">{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
