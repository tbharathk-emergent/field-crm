// Offline queue using IndexedDB. Stores pending field entries and replays on reconnect.
const DB_NAME = "fc_offline";
const STORE = "queue";

let dbPromise = null;
function getDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "client_id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode = "readonly") {
  const db = await getDB();
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function queueAdd(type, payload) {
  const item = {
    client_id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    type,
    payload,
    queued_at: new Date().toISOString(),
  };
  const store = await tx("readwrite");
  await new Promise((res, rej) => {
    const r = store.add(item); r.onsuccess = () => res(); r.onerror = () => rej(r.error);
  });
  window.dispatchEvent(new Event("fc:queue:changed"));
  return item;
}

export async function queueAll() {
  const store = await tx("readonly");
  return new Promise((res, rej) => {
    const r = store.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
  });
}

export async function queueCount() {
  const store = await tx("readonly");
  return new Promise((res, rej) => {
    const r = store.count(); r.onsuccess = () => res(r.result || 0); r.onerror = () => rej(r.error);
  });
}

export async function queueRemove(client_id) {
  const store = await tx("readwrite");
  await new Promise((res, rej) => {
    const r = store.delete(client_id); r.onsuccess = () => res(); r.onerror = () => rej(r.error);
  });
}

export async function syncQueue(api) {
  if (!navigator.onLine) return { ok: false, reason: "offline" };
  const items = await queueAll();
  if (items.length === 0) return { ok: true, synced: 0 };
  try {
    const res = await api.post(
      "/sync/batch",
      items.map((it) => ({ type: it.type, payload: it.payload, client_id: it.client_id }))
    );
    const results = res.data?.results || [];
    for (const r of results) {
      if (r.ok && r.client_id) await queueRemove(r.client_id);
    }
    window.dispatchEvent(new Event("fc:queue:changed"));
    return { ok: true, synced: res.data?.synced || 0, total: res.data?.total || items.length };
  } catch (e) {
    return { ok: false, reason: e?.message || "sync failed" };
  }
}

// API-or-queue helper: tries network first, falls back to queue when offline
export async function postOrQueue(api, url, payload, type) {
  if (!navigator.onLine) {
    await queueAdd(type, payload);
    return { offline: true };
  }
  try {
    const res = await api.post(url, payload);
    return { offline: false, data: res.data };
  } catch (e) {
    // network errors only (status === undefined) fall through to queue
    if (!e.response) {
      await queueAdd(type, payload);
      return { offline: true };
    }
    throw e;
  }
}
