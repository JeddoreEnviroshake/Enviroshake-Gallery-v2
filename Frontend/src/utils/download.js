export async function downloadSingleImage(url, fileName) {
  if (!url) return;

  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error("Failed to fetch image");

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = blobUrl;
    const defaultName = url.split("?")[0].split("/").pop() || "image.jpg";
    link.download = fileName || defaultName;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error("Image download failed:", err);
    alert("Download failed. Check your connection or try again.");
  }
}
