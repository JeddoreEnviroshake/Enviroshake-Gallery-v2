import { imageUrlFromKey } from "../services/api";

export const srcFromImage = (img) => {
  if (!img) return "";
  if (img.s3Url) return img.s3Url;
  if (img.s3Key) return imageUrlFromKey(img.s3Key);
  return img.url || "";
};
