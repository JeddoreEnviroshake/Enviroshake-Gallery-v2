// src/services/api.js

const API_BASE = "http://localhost:4000";

export async function generateUploadUrl(paramsOrName, maybeType) {
  const body =
    typeof paramsOrName === "string"
      ? { fileName: paramsOrName, fileType: maybeType }
      : paramsOrName;

  const res = await fetch(`${API_BASE}/generate-upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error("Failed to generate upload URL");
  }
  return res.json();
}

export async function uploadToSignedUrl(url, file, contentType) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!res.ok) {
    throw new Error("Failed to upload file");
  }
}

export async function downloadGroup(groupId) {
  const res = await fetch(`${API_BASE}/download-group/${encodeURIComponent(groupId)}`);
  if (!res.ok) {
    throw new Error("Failed to fetch ZIP");
  }
  return res.blob();
}

export async function downloadMultipleGroups(groupIds) {
  const res = await fetch(`${API_BASE}/download-multiple-groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupIds }),
  });
  if (!res.ok) {
    throw new Error("Failed to generate ZIP");
  }
  return res.blob();
}

