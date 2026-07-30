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
    return "PlantNet ready · Disease check mas reliable kung may free HF_TOKEN";
  }
  return "Server ready · PlantNet + disease check";
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

