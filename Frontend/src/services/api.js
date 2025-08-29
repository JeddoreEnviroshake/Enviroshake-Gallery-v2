const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} – ${txt || "request failed"}`);
  }
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("application/json")) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Expected application/json, got ${ctype}. ${txt}`);
  }
  return res.json();
}

export async function generateUploadUrl(fileName, fileType) {
  if (!fileName || !fileType) {
    throw new Error("Missing fileName or fileType");
  }
  const body = JSON.stringify({ fileName, fileType });
  const paths = ["/generate-upload-url", "/presign-upload", "/presign"];
  let lastErr = null;
  for (const p of paths) {
    try {
      const url = `${API_BASE}${p}`;
      return await fetchJson(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body,
      });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("All presign paths failed");
}

export async function downloadMultipleGroups(groupIds) {
  if (!Array.isArray(groupIds) || groupIds.length === 0) {
    throw new Error("Missing groupIds");
  }
  const url = `${API_BASE}/download-multiple-groups`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ groupIds }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} – ${txt || "request failed"}`);
  }
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("application/zip")) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Expected application/zip, got ${ctype}. ${txt}`);
  }
  return res.blob();
}

export async function downloadGroup(groupId) {
  if (!groupId) throw new Error("Missing groupId");
  const url = `${API_BASE}/download-group/${encodeURIComponent(groupId)}`;
  const res = await fetch(url, { method: "GET", credentials: "include" });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} – ${txt || "request failed"}`);
  }
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("application/zip")) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Expected application/zip, got ${ctype}. ${txt}`);
  }
  return res.blob();
}

export async function generateUploadUrl({ groupId, filename, contentType }) {
  if (!filename) {
    throw new Error("Missing filename");
  }
  const url = `${API_BASE}/generate-upload-url`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ groupId, filename, contentType }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} – ${txt || "request failed"}`);
  }
  return await res.json();
}

