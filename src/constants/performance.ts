import type { PerfMetric } from "../types";

export const PERF_METRICS: Record<string, PerfMetric> = {
  yieldEnhancement: { value: 158, unit: "bps", label: "Yield Enhancement vs FD", target: 150, trend: [142, 145, 148, 150, 153, 155, 158] },
  idleCashReduction: { value: 43.2, unit: "%", label: "Idle Cash Reduction", target: 40, trend: [28, 32, 35, 38, 40, 42, 43.2] },
  predictionMAPE: { value: 3.8, unit: "%", label: "Forecast MAPE", target: 5, trend: [8.2, 7.1, 6.0, 5.2, 4.5, 4.1, 3.8] },
  settlementRate: { value: 100, unit: "%", label: "Settlement Success Rate", target: 100, trend: [100, 100, 100, 100, 100, 100, 100] },
  manualReduction: { value: 91, unit: "%", label: "Manual Ops Reduction", target: 90, trend: [65, 72, 78, 83, 87, 89, 91] },
  bufferEfficiency: { value: 94.7, unit: "%", label: "Buffer Utilization Efficiency", target: 90, trend: [82, 85, 88, 90, 92, 93.5, 94.7] },
  avgDeploymentTime: { value: 2.3, unit: "min", label: "Avg Deployment Time", target: 5, trend: [12, 8, 6, 4.5, 3.2, 2.8, 2.3] },
  counterpartyDiv: { value: 8, unit: "banks", label: "Counterparty Diversification", target: 6, trend: [4, 5, 5, 6, 7, 7, 8] },
};
