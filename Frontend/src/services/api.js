// src/services/api.js

const API_BASE = import.meta.env.VITE_BACKEND_ORIGIN;

export async function generateUploadUrl({
  groupId,
  imageId,
  fileType,
  fileName,
  isThumbnail,
}) {
  const res = await fetch(`${API_BASE}/generate-upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      groupId,
      imageId,
      fileType,
      fileName,
      isThumbnail,
    }),
  });
  if (!res.ok) {
    throw new Error("Failed to generate upload URL");
  }
  return res.json();
}

export async function uploadToSignedUrl(uploadURL, fileOrBlob, contentType) {
  const res = await fetch(uploadURL, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: fileOrBlob,
  });
  if (!res.ok) {
    throw new Error("Failed to upload to signed URL");
  }
  return res;
}

export function imageUrlFromKey(s3Key) {
  return `${API_BASE}/get-object/${encodeURIComponent(s3Key)}`;
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

