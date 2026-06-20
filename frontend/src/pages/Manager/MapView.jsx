import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { api } from "@/lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useApp } from "@/context/AppContext";

// Fix default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export default function MapView() {
  const { t } = useApp();
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [points, setPoints] = useState([]);

  useEffect(() => {
    api.get("/tenant/users", { params: { role: "employee" } }).then(r => {
      setEmployees(r.data);
      if (r.data[0]) setEmployeeId(r.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!employeeId) return;
    api.get("/locations", { params: { user_id: employeeId, date } }).then(r => setPoints(r.data));
  }, [employeeId, date]);

  const center = points.length > 0 ? [points[0].lat, points[0].lng] : [17.385, 78.4867]; // Hyderabad default
  const path = points.map(p => [p.lat, p.lng]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-3xl font-bold">GPS Tracking</h1>
        <div className="flex gap-2">
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Employee" /></SelectTrigger>
            <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </div>
      </div>
      <div className="card-surface p-2 h-[600px]">
        <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {points.map((p, i) => (
            <Marker key={i} position={[p.lat, p.lng]}>
              <Popup>{new Date(p.timestamp).toLocaleTimeString()}</Popup>
            </Marker>
          ))}
          {path.length > 1 && <Polyline positions={path} pathOptions={{ color: "var(--brand-primary)", weight: 4 }} />}
        </MapContainer>
      </div>
      {points.length === 0 && <div className="text-center text-brand-mute text-sm">{t("no_data")}</div>}
    </div>
  );
}
