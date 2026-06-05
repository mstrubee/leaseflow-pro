/**
 * Triggers a reliable file download for a Blob.
 * Uses an anchor + object URL which works inside sandboxed/preview iframes,
 * unlike jsPDF's `doc.save()` which can be silently blocked.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}
