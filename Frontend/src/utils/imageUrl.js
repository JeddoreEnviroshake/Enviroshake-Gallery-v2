export const srcFromImage = (img) => {
  if (!img) return "";
  if (img.s3Url) return img.s3Url;
  if (img.url) return img.url;
  const key = img.s3Key || img.thumbnailS3Key;
  if (key) {
    const base = import.meta.env.VITE_IMAGE_BASE_URL;
    if (base) {
      const trimmed = base.replace(/\/$/, "");
      return `${trimmed}/${key}`;
    }
  }
  return "";
};
