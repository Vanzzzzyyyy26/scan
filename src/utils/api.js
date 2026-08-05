// Empty = same origin (works on phone via Dev Tunnel + CRA proxy, or Express static serve).
// Override only if frontend and API are on different hosts: REACT_APP_API_URL=https://...
export const API_BASE = (process.env.REACT_APP_API_URL || "").replace(/\/$/, "");

export function statusPillClass(apiReady) {
  if (!apiReady) return "status-bad";
  if (apiReady.offline || !apiReady.ok) return "status-bad";
  if (!apiReady.hasApiKey) return "status-warn";
  if (!apiReady.hasHfToken) return "status-warn";
  return "status-ok";
}

export function statusPillText(apiReady) {
  if (!apiReady) return "Checking server...";
  if (apiReady.offline) {
    return "Server offline — local: npm run dev · Vercel: set env + redeploy with /api";
  }
  if (!apiReady.hasApiKey) {
    return "Server OK — kailangan ng FREE PlantNet key (my.plantnet.org)";
  }
  if (!apiReady.hasHfToken) {
    return "PlantNet ready · mag-set ng HF_TOKEN para dynamic AI chat";
  }
  return "Server ready · PlantNet + dynamic AI chat";
}

async function readJsonSafe(res) {
  const text = await res.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** GET /api/health — returns readiness info or offline fallback. */
export async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await readJsonSafe(res);
    if (!res.ok || !data) {
      return { ok: false, hasApiKey: false, offline: true };
    }
    return data;
  } catch {
    return { ok: false, hasApiKey: false, offline: true };
  }
}

/**
 * POST /api/identify with a JPEG/data-URL image.
 * @returns {Promise<object>} plant result from the server
 */
export async function identifyPlant(imageDataUrl) {
  const res = await fetch(`${API_BASE}/api/identify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl }),
  });

  const data = await readJsonSafe(res);
  if (!data) {
    throw new Error(
      res.status === 405
        ? "API route not available on this host (405). Redeploy with Vercel serverless /api, or set REACT_APP_API_URL to your backend."
        : `Server returned empty/non-JSON response (${res.status}). Backend may be offline or misconfigured.`
    );
  }
  if (!res.ok) {
    throw new Error(data.error || "Identification failed");
  }
  return data.plant;
}

export async function fetchScanHistory(limit = 100) {
  const res = await fetch(`${API_BASE}/api/history?limit=${encodeURIComponent(limit)}`);
  const data = await readJsonSafe(res);
  if (!data) {
    throw new Error(`Walang history response mula sa server (${res.status}).`);
  }
  if (!res.ok) {
    throw new Error(data.error || "Failed to load scan history");
  }
  return Array.isArray(data.scans) ? data.scans : [];
}

export async function saveScanHistory({ plant, imageDataUrl }) {
  const res = await fetch(`${API_BASE}/api/history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plant, imageDataUrl }),
  });

  const data = await readJsonSafe(res);
  if (!data) {
    throw new Error(`Walang save response mula sa server (${res.status}).`);
  }
  if (!res.ok) {
    throw new Error(data.error || "Failed to save scan history");
  }
  return data.saved;
}

export async function deleteScanHistory(id) {
  const res = await fetch(`${API_BASE}/api/history/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  const data = await readJsonSafe(res);
  if (!data) {
    throw new Error(`Walang delete response mula sa server (${res.status}).`);
  }
  if (!res.ok) {
    throw new Error(data.error || "Failed to delete scan history");
  }
  return Boolean(data.deleted);
}

/**
 * POST /api/chat — plant/tree Q&A (uses scanned plant as context when provided).
 * @returns {Promise<{ reply: string, provider?: string, offline?: boolean, note?: string }>}
 */
export async function chatAboutPlant({ message, history = [], plant = null }) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history, plant }),
  });

  const data = await readJsonSafe(res);
  if (!data) {
    throw new Error(
      res.status === 405
        ? "Chat API hindi available sa host na ito."
        : `Walang sagot mula sa server (${res.status}). Siguraduhing naka-run ang backend.`
    );
  }
  if (!res.ok) {
    throw new Error(data.error || "Chat failed");
  }
  return data;
}
