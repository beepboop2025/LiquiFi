export const formatCr = (v: number): string =>
  `\u20B9${(Number(v) || 0).toFixed(1)}Cr`;

export const formatL = (v: number): string =>
  `\u20B9${(Number(v) || 0).toFixed(1)}L`;

export const formatPct = (v: number): string =>
  `${(Number(v) || 0).toFixed(2)}%`;

export const formatLatency = (latency: number | null): string =>
  latency == null ? "N/A" : `${(Number(latency) || 0).toFixed(0)}ms`;

export const formatUptime = (uptime: number): string =>
  `${(Number(uptime) || 0).toFixed(2)}%`;
