/* ═══════════════════════════════════════════════════════════════
   Optional backend bridge.
   For a static-only deployment (e.g. Vercel), leave API_BASE empty.
   If you deploy the Spring Boot backend separately (for example on
   Render), set API_BASE to: https://YOUR-BACKEND-DOMAIN/api
   ═══════════════════════════════════════════════════════════════ */
window.API_BASE = window.API_BASE || "";

const API_ROOT = (window.API_BASE || "/api").replace(/\/$/, "");

async function recordExperiment(experimentCode, operation, imageName = "browser-image") {
  try {
    await fetch(`${API_ROOT}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experimentCode, operation, imageName })
    });
  } catch (e) {
    // The image-processing practicals are client-side and continue to work
    // even when the optional backend is not deployed.
    console.warn("Backend unavailable; visual practical still works.", e);
  }
}

async function loadBackendStudent() {
  try {
    const r = await fetch(`${API_ROOT}/student`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    return null;
  }
}
