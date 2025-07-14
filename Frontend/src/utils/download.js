export function downloadSingleImage(url, fileName) {
  if (!url) return;
  const link = document.createElement('a');
  link.href = url;
  const defaultName = url.split('?')[0].split('/').pop() || 'image.jpg';
  link.setAttribute('download', fileName || defaultName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
