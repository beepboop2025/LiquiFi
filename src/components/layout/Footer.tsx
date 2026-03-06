import { memo } from "react";
import type { AppBackendState } from "../../types";

interface FooterProps {
  backend: AppBackendState;
}

const Footer = memo<FooterProps>(({ backend }) => (
  <footer style={{ borderTop: "1px solid var(--border-1)", padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 10 }}>
    <div style={{ display: "flex", gap: 16, fontSize: 10, color: "var(--text-4)" }}>
      <span>LiquiFi v2.4.1</span>
      <span>{"\u2022"}</span>
      <span>AWS Mumbai (ap-south-1)</span>
      <span>{"\u2022"}</span>
      <span>Kubernetes 8/8 pods healthy</span>
      <span>{"\u2022"}</span>
      <span>Kafka: {backend.queueDepth} queued events</span>
      <span>{"\u2022"}</span>
      <span>TimescaleDB: 2.1TB / 5TB</span>
    </div>
    <div style={{ display: "flex", gap: 12, fontSize: 10, color: "var(--text-4)" }}>
      <span>Data encrypted AES-256</span>
      <span>{"\u2022"}</span>
      <span>RBI Data Residency {"\u2713"}</span>
      <span>{"\u2022"}</span>
      <span className="mono">Latency P99: {backend.apiLatencyP99.toFixed(0)}ms</span>
    </div>
  </footer>
));
Footer.displayName = "Footer";
export default Footer;
