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
    headers: {
      "Content-Type": contentType || "application/octet-stream",
    },
    body: fileOrBlob,
  });
  if (!res.ok) {
    throw new Error(`Upload failed with status ${res.status}`);
  }
  return true;
}

export function uploadFileWithProgress(file, uploadURL, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadURL);
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream"
    );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && typeof onProgress === "function") {
        onProgress((e.loaded / e.total) * 100);
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(file);
  });
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

