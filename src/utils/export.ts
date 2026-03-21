// ---------------------------------------------------------------------------
// Core download helper
// ---------------------------------------------------------------------------
function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  const parent = document.body;
  if (!parent) {
    URL.revokeObjectURL(url);
    return;
  }
  parent.appendChild(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 100);
}

// ---------------------------------------------------------------------------
// JSON export (existing)
// ---------------------------------------------------------------------------
export const exportJsonFile = (filename: string, payload: unknown): void => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(blob, filename);
};

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------
export function exportCsvFile(filename: string, rows: Record<string, unknown>[]): void {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvLines: string[] = [headers.join(",")];
  for (const row of rows) {
    const values = headers.map((h) => {
      const v = row[h];
      if (v === null || v === undefined) return "";
      const str = String(v);
      // Escape values with commas, quotes, or newlines
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvLines.push(values.join(","));
  }
  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, filename);
}

// ---------------------------------------------------------------------------
// Rate snapshot to CSV rows
// ---------------------------------------------------------------------------
export function exportRatesAsCsv(rates: Record<string, number>, filename?: string): void {
  const ts = new Date().toISOString();
  const rows = Object.entries(rates).map(([field, value]) => ({
    timestamp: ts,
    field,
    value: Number(value) || 0,
  }));
  exportCsvFile(filename || `liquifi-rates-${ts.replace(/[:.]/g, "-")}.csv`, rows);
}

// ---------------------------------------------------------------------------
// Order book to CSV
// ---------------------------------------------------------------------------
export function exportOrderBookCsv(
  orderBook: Array<{ id: string; time: string; instrument: string; side: string; amount: number; rate: number; counterparty: string; status: string; fillPct: number; platform: string }>,
  filename?: string,
): void {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  exportCsvFile(filename || `liquifi-orders-${ts}.csv`, orderBook);
}

// ---------------------------------------------------------------------------
// Audit trail to CSV
// ---------------------------------------------------------------------------
export function exportAuditCsv(
  audit: Array<{ id: string; time: string; action: string; detail: string; user: string; level: string; hash: string }>,
  filename?: string,
): void {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  exportCsvFile(filename || `liquifi-audit-${ts}.csv`, audit);
}

// ---------------------------------------------------------------------------
// Export All — combined report as a single JSON bundle
// (We avoid zip libraries to keep bundle small; this creates a structured JSON)
// ---------------------------------------------------------------------------
export function exportAllReport(data: {
  rates: Record<string, number>;
  orderBook: unknown[];
  auditTrail: unknown[];
  perfMetrics?: unknown;
}): void {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const report = {
    exportedAt: new Date().toISOString(),
    version: "2.4.1",
    sections: {
      rates: data.rates,
      orderBook: data.orderBook,
      auditTrail: data.auditTrail,
      performanceMetrics: data.perfMetrics || null,
    },
  };
  exportJsonFile(`liquifi-full-report-${ts}.json`, report);
}
