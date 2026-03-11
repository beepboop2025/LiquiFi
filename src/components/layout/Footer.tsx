import { memo } from "react";
import type { AppBackendState } from "../../types";

interface FooterProps {
  backend: AppBackendState;
}

const SEP = "\u2022";

const Footer = memo<FooterProps>(({ backend }) => (
  <footer className="footer-bar">
    <div style={{ display: "flex", gap: 16, fontSize: 10, color: "var(--text-4)", alignItems: "center" }}>
      <span style={{ fontWeight: 600, color: "var(--text-3)" }}>LiquiFi v2.4.1</span>
      <span>{SEP}</span>
      <span>AWS Mumbai (ap-south-1)</span>
      <span>{SEP}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
        Kubernetes 8/8 pods healthy
      </span>
      <span>{SEP}</span>
      <span>Kafka: {backend.queueDepth} queued events</span>
      <span>{SEP}</span>
      <span>TimescaleDB: 2.1TB / 5TB</span>
    </div>
    <div style={{ display: "flex", gap: 12, fontSize: 10, color: "var(--text-4)", alignItems: "center" }}>
      <span>Data encrypted AES-256</span>
      <span>{SEP}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
        RBI Data Residency
        <span style={{ color: "var(--green)", fontWeight: 600 }}>{"\u2713"}</span>
      </span>
      <span>{SEP}</span>
      <span className="mono" style={{
        color: (backend.apiLatencyP99 ?? 0) < 40 ? "var(--green)" : (backend.apiLatencyP99 ?? 0) < 80 ? "var(--amber)" : "var(--red)",
        transition: "color var(--duration-slow) var(--ease-smooth)",
        fontWeight: 500,
      }}>
        Latency P99: {(backend.apiLatencyP99 ?? 0).toFixed(0)}ms
      </span>
    </div>
  </footer>
));
Footer.displayName = "Footer";
export default Footer;
