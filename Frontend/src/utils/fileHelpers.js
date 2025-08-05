export const getFileExt = (fileName) => {
  if (!fileName) return "";
  const idx = fileName.lastIndexOf(".");
  return idx !== -1 ? fileName.substring(idx) : "";
};
