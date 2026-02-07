/**
 * Export a JSON payload as a downloadable file.
 * @param {string} filename - Target filename
 * @param {*} payload - Data to serialize
 */
export const exportJsonFile = (filename, payload) => {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  const parent = document.body;
  if (!parent) { URL.revokeObjectURL(url); return; }
  parent.appendChild(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 100);
};
