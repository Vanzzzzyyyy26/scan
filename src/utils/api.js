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
    return "Server offline — i-run: npm run dev (PC must keep running)";
  }
  if (!apiReady.hasApiKey) {
    return "Server OK — kailangan ng FREE PlantNet key (my.plantnet.org)";
  }
  if (!apiReady.hasHfToken) {
    return "PlantNet ready · Disease check mas reliable kung may free HF_TOKEN";
  }
  return "Server ready · PlantNet + disease check";
}

/** GET /api/health — returns readiness info or offline fallback. */
export async function fetchHealth() {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    return await res.json();
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

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Identification failed");
  }
  return data.plant;
}

