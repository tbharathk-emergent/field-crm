// GPS background tracker: pings server every 5 minutes while employee is checked in.
// Persists state across reloads via localStorage.
import { api } from "@/lib/api";
import { queueAdd } from "@/lib/offline";

const KEY = "fc_gps_state";
let intervalId = null;

function readState() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function writeState(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

async function captureAndPing() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const payload = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      try {
        if (navigator.onLine) {
          await api.post("/employee/location", payload);
        } else {
          await queueAdd("location", { ...payload, timestamp: new Date().toISOString() });
        }
      } catch (e) {
        // queue on network failure
        await queueAdd("location", { ...payload, timestamp: new Date().toISOString() });
      }
    },
    () => {},
    { enableHighAccuracy: false, maximumAge: 120000, timeout: 10000 }
  );
}

export function startTracking() {
  const s = readState();
  if (s.active) return; // already running
  writeState({ active: true, startedAt: new Date().toISOString() });
  if (intervalId) clearInterval(intervalId);
  // initial ping right away
  captureAndPing();
  intervalId = setInterval(captureAndPing, 5 * 60 * 1000);
}

export function stopTracking() {
  writeState({ active: false });
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}

export function resumeIfActive() {
  const s = readState();
  if (s.active && !intervalId) {
    captureAndPing();
    intervalId = setInterval(captureAndPing, 5 * 60 * 1000);
  }
}

export function isTracking() {
  return readState().active === true;
}
