const BUCKET_URL = "https://enviroshake-gallery-images.s3.amazonaws.com";

export const srcFromImage = (img) => {
  if (!img) return "";
  if (img.s3Url) return img.s3Url;
  if (img.s3Key) return `${BUCKET_URL}/${img.s3Key}`;
  return img.url || "";
};
