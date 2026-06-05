/**
 * Triggers a reliable file download for a Blob.
 * Uses an anchor + object URL which works inside sandboxed/preview iframes,
 * unlike jsPDF's `doc.save()` which can be silently blocked.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const fileBlob = blob.type ? blob : new Blob([blob], { type: "application/pdf" });
  const url = URL.createObjectURL(fileBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.target = "_self";
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}
