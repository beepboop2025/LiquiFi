import type { Integration } from "../types";

export const INTEGRATION_BLUEPRINT: Integration[] = [
  { system: "CCIL (CBLO/Repo)", status: "Connected", latency: 12, uptime: 99.99 },
  { system: "NDS-OM (T-Bills/G-Sec)", status: "Connected", latency: 18, uptime: 99.95 },
  { system: "NDS-Call (Call Money)", status: "Connected", latency: 15, uptime: 99.98 },
  { system: "FX-CLEAR (Forex)", status: "Connected", latency: 22, uptime: 99.92 },
  { system: "CAMS/Karvy (MF)", status: "Connected", latency: 45, uptime: 99.85 },
  { system: "FBIL (Rate Feeds)", status: "Connected", latency: 8, uptime: 99.99 },
  { system: "FIMMDA (CD Rates)", status: "Connected", latency: 35, uptime: 99.90 },
  { system: "Bank APIs (RTGS/NEFT)", status: "Connected", latency: 28, uptime: 99.95 },
  { system: "SAP/Oracle ERP", status: "Connected", latency: 65, uptime: 99.80 },
  { system: "Apache Kafka (MQ)", status: "Healthy", latency: 3, uptime: 99.99 },
  { system: "TimescaleDB", status: "Healthy", latency: 5, uptime: 99.99 },
  { system: "MLflow Pipeline", status: "Healthy", latency: null, uptime: 99.95 },
];
