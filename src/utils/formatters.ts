/** Safe numeric coercion: returns 0 for NaN, Infinity, null, undefined */
const safeNum = (v: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const formatCr = (v: number): string =>
  `\u20B9${safeNum(v).toFixed(1)}Cr`;

export const formatL = (v: number): string =>
  `\u20B9${safeNum(v).toFixed(1)}L`;

export const formatPct = (v: number): string =>
  `${safeNum(v).toFixed(2)}%`;

export const formatLatency = (latency: number | null): string =>
  latency == null ? "N/A" : `${safeNum(latency).toFixed(0)}ms`;

export const formatUptime = (uptime: number): string =>
  `${safeNum(uptime).toFixed(2)}%`;
