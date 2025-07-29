const API_BASE = "http://localhost:4000";

export async function fetchImageGroups() {
  try {
    const res = await fetch(`${API_BASE}/image-groups`);
    if (!res.ok) throw new Error("Failed to fetch image groups");
    return await res.json();
  } catch (err) {
    console.error(err);
    throw err;
  }
}

export async function fetchImagesByGroup(groupId) {
  try {
    const res = await fetch(`${API_BASE}/images/${groupId}`);
    if (!res.ok) throw new Error("Failed to fetch images");
    return await res.json();
  } catch (err) {
    console.error(err);
    throw err;
  }
}

export async function downloadGroup(groupId) {
  try {
    const res = await fetch(`${API_BASE}/download-group/${groupId}`);
    if (!res.ok) throw new Error("Failed to download group");
    return await res.blob();
  } catch (err) {
    console.error(err);
    throw err;
  }
}
