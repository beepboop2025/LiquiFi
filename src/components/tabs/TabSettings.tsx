import {
  Activity,
  Clock,
  Cpu,
  Key,
  Layers,
  Lock,
  RotateCcw,
  Server,
  Settings,
  Shield,
  Unlock,
} from "lucide-react";

import { ACCESS_ROLES } from "../../constants/access";
import { formatLatency, formatUptime } from "../../utils/formatters";
import SectionTitle from "../shared/SectionTitle";
import StatBox from "../shared/StatBox";
import type { AppBackendState, AccessRole, Integration } from "../../types";

interface TabSettingsProps {
  backend: AppBackendState;
  onToggleKillSwitch: () => void;
  onToggleFailover: () => void;
  onResetCircuit: () => void;
}

interface SecurityConfigItem {
  label: string;
  value: string;
  status: string;
}

interface ArchItem {
  layer: string;
  tech: string;
  detail: string;
}

export default function TabSettings({ backend, onToggleKillSwitch, onToggleFailover, onResetCircuit }: TabSettingsProps) {

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="card card-glow">
        <SectionTitle icon={Server} title="Backend Runtime Controls" subtitle="High-availability controls for execution and failover behavior" color="var(--cyan)" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
          <StatBox label="Circuit Breaker" value={backend.circuitOpen ? "OPEN" : "CLOSED"} sub={backend.circuitOpenedAt ? `Opened at ${backend.circuitOpenedAt}` : "Healthy"} color={backend.circuitOpen ? "var(--red)" : "var(--green)"} icon={Shield} small />
          <StatBox label="Queue Depth" value={`${backend.queueDepth}`} sub="Execution messages pending" color={backend.queueDepth > 20 ? "var(--amber)" : "var(--cyan)"} icon={Layers} small />
          <StatBox label="Throughput" value={`${backend.throughputPerMin}/min`} sub="Settlements + orders" color="var(--blue)" icon={Activity} small />
          <StatBox label="P99 Latency" value={`${(backend.apiLatencyP99 ?? 0).toFixed(0)}ms`} sub={`${backend.failoverMode.toUpperCase()} failover`} color={(backend.apiLatencyP99 ?? 0) > 45 ? "var(--amber)" : "var(--green)"} icon={Clock} small />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn-ghost" onClick={onToggleKillSwitch}>
            {backend.killSwitch ? <Unlock size={12} /> : <Lock size={12} />} {backend.killSwitch ? "Disable" : "Enable"} Kill Switch
          </button>
          <button className="btn-ghost" onClick={onToggleFailover}>
            <Server size={12} /> Switch to {backend.failoverMode === "auto" ? "Manual" : "Auto"} Failover
          </button>
          <button className="btn-ghost" onClick={onResetCircuit} disabled={!backend.circuitOpen}>
            <RotateCcw size={12} /> Reset Circuit
          </button>
        </div>
      </div>

      <div className="card">
        <SectionTitle icon={Key} title="Role-Based Access Control" subtitle="2FA enforced for all roles • End-to-end encryption on all data channels" color="var(--amber)" />
        <div>
          {(ACCESS_ROLES as AccessRole[]).map((role, i) => (
            <div key={i} className="anim-row" style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 2fr 2.5fr 0.8fr 0.6fr",
              padding: "12px 14px",
              borderBottom: "1px solid var(--border-1)",
              alignItems: "center",
              animationDelay: `${i * 50}ms`,
              transition: "background var(--duration-fast) var(--ease-smooth)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(30,48,80,0.15)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
            >
              <div>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{role.role}</span>
                <div className="badge mono" style={{ background: "var(--bg-1)", color: "var(--text-3)", marginTop: 4, display: "inline-block" }}>{role.level}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {role.users.map((u, j) => (
                  <span key={j} style={{ background: "var(--bg-3)", borderRadius: 4, padding: "3px 8px", fontSize: 11, color: "var(--text-2)" }}>{u}</span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {role.permissions.map((p, j) => (
                  <span key={j} className="badge" style={{ background: "var(--bg-1)", color: "var(--text-3)" }}>{p}</span>
                ))}
              </div>
              <span style={{ fontSize: 11 }}>{role.twoFA ? <span style={{ color: "var(--green)", display: "flex", alignItems: "center", gap: 4 }}><Lock size={11} /> 2FA</span> : <span style={{ color: "var(--red)" }}>No 2FA</span>}</span>
              <button className="btn-ghost" style={{ padding: "4px 8px" }}><Settings size={11} /></button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div className="card">
          <SectionTitle icon={Lock} title="Security Configuration" subtitle="Encryption, data residency, and audit settings" color="var(--red)" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {([
              { label: "Data Encryption", value: "AES-256 (at-rest) + TLS 1.3 (in-transit)", status: "active" },
              { label: "Data Residency", value: "AWS Mumbai (ap-south-1) — RBI compliant", status: "active" },
              { label: "API Authentication", value: "OAuth 2.0 + mTLS for bank integrations", status: "active" },
              { label: "Session Timeout", value: "15 minutes idle, 8 hours max", status: "active" },
              { label: "IP Whitelisting", value: "Enabled — 12 IPs authorized", status: "active" },
              { label: "HSM Integration", value: "AWS CloudHSM for signing keys", status: "active" },
              { label: "Audit Log Retention", value: "7 years (immutable, append-only)", status: "active" },
              { label: "Penetration Testing", value: "Last: Jan 15, 2026 — 0 critical findings", status: "active" },
            ] as SecurityConfigItem[]).map((item, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-1)" }}>
                <span style={{ fontSize: 12, color: "var(--text-1)" }}>{item.label}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>{item.value}</span>
                  <span className="status-dot live" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <SectionTitle icon={Server} title="System Integrations" subtitle="API connectivity and health status for all external systems" color="var(--blue)" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {backend.integrations.map((sys: Integration, i: number) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 0.8fr 0.8fr", padding: "6px 0", borderBottom: "1px solid var(--border-1)", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--text-1)", fontWeight: 500 }}>{sys.system}</span>
                <span style={{ fontSize: 10, color: sys.status === "Degraded" ? "var(--amber)" : sys.status === "Down" ? "var(--red)" : "var(--green)", display: "flex", alignItems: "center", gap: 4 }}><span className={`status-dot ${sys.status === "Down" ? "error" : sys.status === "Degraded" ? "warn" : "live"}`} />{sys.status}</span>
                <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{formatLatency(sys.latency)}</span>
                <span className="mono" style={{ fontSize: 10, color: sys.uptime < 99.8 ? "var(--amber)" : "var(--green)" }}>{formatUptime(sys.uptime)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <SectionTitle icon={Cpu} title="Technical Architecture" subtitle="Production deployment specifications" color="var(--purple)" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {([
            { layer: "Frontend", tech: "React.js + WebSocket", detail: "Real-time data via WS, Recharts for viz" },
            { layer: "ML Backend", tech: "Python (FastAPI)", detail: "LSTM/Transformer, MLflow versioning" },
            { layer: "Trading Engine", tech: "Node.js", detail: "Low-latency order routing, event-driven" },
            { layer: "Time-Series DB", tech: "TimescaleDB", detail: "Rate data, tick-by-tick history" },
            { layer: "Transactional DB", tech: "PostgreSQL", detail: "Orders, positions, compliance logs" },
            { layer: "Message Queue", tech: "Apache Kafka", detail: "High-frequency payment stream ingestion" },
            { layer: "ML Pipeline", tech: "Airflow + MLflow", detail: "Daily retrain, model versioning, A/B" },
            { layer: "Deployment", tech: "AWS Mumbai + K8s", detail: "RBI data residency, auto-scaling" },
          ] as ArchItem[]).map((item, i) => (
            <div key={i} className="anim-in" style={{
              background: "var(--bg-1)",
              borderRadius: 8,
              padding: 12,
              animationDelay: `${i * 40}ms`,
              transition: "all var(--duration-normal) var(--ease-smooth)",
              cursor: "default",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-md)";
              (e.currentTarget as HTMLDivElement).style.background = "var(--bg-3)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.transform = "";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "";
              (e.currentTarget as HTMLDivElement).style.background = "var(--bg-1)";
            }}
            >
              <div style={{ fontSize: 10, color: "var(--text-4)", textTransform: "uppercase", marginBottom: 4 }}>{item.layer}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--purple)", marginBottom: 4 }}>{item.tech}</div>
              <div style={{ fontSize: 10, color: "var(--text-3)" }}>{item.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
