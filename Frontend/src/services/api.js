const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

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
  return await res.blob();
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

  return await res.blob();
}

