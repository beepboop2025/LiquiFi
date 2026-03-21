import { memo, useState, useEffect } from "react";
import { Download } from "lucide-react";
import type { AppBackendState } from "../../types";
import { getPerfReport, getApiSuccessRate } from "../../utils/perfMonitor";
import { getWsConnectionState, getLastWsMessageTs } from "../../services/api";
import { SHORTCUT_LIST } from "../../hooks/useKeyboardShortcuts";

interface FooterProps {
  backend: AppBackendState;
  backendConnected?: boolean;
  rates?: Record<string, number>;
  onExportAll?: () => void;
}

const SEP = "\u2022";

/** Color based on health: green / amber / red */
function healthColor(good: boolean, warn: boolean): string {
  if (good) return "var(--green)";
  if (warn) return "var(--amber)";
  return "var(--red)";
}

const Footer = memo<FooterProps>(({ backend, onExportAll }) => {
  // Update perf metrics every 5s
  const [perfReport, setPerfReport] = useState(() => getPerfReport());
  const [apiRate, setApiRate] = useState(100);
  const [wsState, setWsState] = useState(getWsConnectionState());
  const [lastUpdate, setLastUpdate] = useState(getLastWsMessageTs());
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setPerfReport(getPerfReport());
      setApiRate(getApiSuccessRate());
      setWsState(getWsConnectionState());
      setLastUpdate(getLastWsMessageTs());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const lastUpdateAge = lastUpdate > 0 ? Math.round((Date.now() - lastUpdate) / 1000) : null;
  const wsColor = wsState === 'connected' ? 'var(--green)' : wsState === 'reconnecting' ? 'var(--amber)' : 'var(--red)';
  const wsLabel = wsState === 'connected' ? 'WS Connected' : wsState === 'reconnecting' ? 'WS Reconnecting' : 'WS Disconnected';

  // Data quality from backend
  const dq = backend.dataQuality;
  const dqReal = dq?.realFieldsCount ?? 0;
  const dqTotal = dq?.totalFields ?? 34;
  const dqPct = dqTotal > 0 ? Math.round((dqReal / dqTotal) * 100) : 0;
  const dqColor = dqPct >= 70 ? 'var(--green)' : dqPct >= 40 ? 'var(--amber)' : 'var(--red)';

  return (
    <footer className="footer-bar" style={{ flexDirection: "column", gap: 0, padding: 0 }}>
      {/* Primary info row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 24px", width: "100%", boxSizing: "border-box" }}>
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
      </div>

      {/* Connection health + performance row */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "4px 24px 6px",
        width: "100%",
        boxSizing: "border-box",
        borderTop: "1px solid rgba(30,48,80,0.15)",
      }}>
        <div style={{ display: "flex", gap: 14, fontSize: 10, color: "var(--text-4)", alignItems: "center" }}>
          {/* WebSocket status */}
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: wsColor, display: "inline-block" }} />
            <span className="mono" style={{ color: wsColor, fontWeight: 500 }}>{wsLabel}</span>
          </span>
          <span>{SEP}</span>

          {/* Last data update */}
          <span className="mono" style={{
            color: lastUpdateAge !== null && lastUpdateAge < 10 ? "var(--green)"
              : lastUpdateAge !== null && lastUpdateAge < 30 ? "var(--amber)"
              : "var(--red)",
            fontWeight: 500,
          }}>
            Last update: {lastUpdateAge !== null ? `${lastUpdateAge}s ago` : "N/A"}
          </span>
          <span>{SEP}</span>

          {/* API success rate */}
          <span className="mono" style={{
            color: healthColor(apiRate >= 95, apiRate >= 80),
            fontWeight: 500,
          }}>
            API: {apiRate.toFixed(0)}% success
          </span>
          <span>{SEP}</span>

          {/* Data quality score */}
          <span className="mono" style={{ color: dqColor, fontWeight: 500 }}>
            Data: {dqReal}/{dqTotal} live ({dqPct}%)
          </span>
          <span>{SEP}</span>

          {/* Perf metrics */}
          <span className="mono" style={{
            color: perfReport.apiLatency.avg < 100 ? "var(--green)" : perfReport.apiLatency.avg < 500 ? "var(--amber)" : "var(--red)",
            fontWeight: 500,
          }}>
            Avg API: {perfReport.apiLatency.avg}ms
          </span>
          <span>{SEP}</span>
          <span className="mono" style={{
            color: perfReport.wsLatency.avg < 100 ? "var(--green)" : perfReport.wsLatency.avg < 500 ? "var(--amber)" : "var(--red)",
            fontWeight: 500,
          }}>
            WS: {perfReport.wsLatency.avg}ms
          </span>
          <span>{SEP}</span>
          <span className="mono" style={{ fontWeight: 500 }}>
            Uptime: {Math.floor(perfReport.uptime / 60)}m
          </span>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {/* Export All button */}
          {onExportAll && (
            <button
              onClick={onExportAll}
              style={{
                background: "rgba(6,214,224,0.06)",
                border: "1px solid rgba(6,214,224,0.15)",
                color: "var(--cyan)",
                fontSize: 9,
                fontWeight: 600,
                padding: "3px 10px",
                borderRadius: 4,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                transition: "all 0.2s ease",
              }}
              title="Export all data (rates, orders, audit, performance)"
            >
              <Download size={10} />
              Export All
            </button>
          )}

          {/* Keyboard shortcuts tooltip */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowShortcuts(!showShortcuts)}
              style={{
                background: "rgba(30,48,80,0.3)",
                border: "1px solid var(--border-1)",
                color: "var(--text-4)",
                fontSize: 9,
                fontWeight: 600,
                padding: "3px 8px",
                borderRadius: 4,
                cursor: "pointer",
              }}
              title="Keyboard shortcuts"
            >
              ?
            </button>
            {showShortcuts && (
              <div style={{
                position: "absolute",
                bottom: 28,
                right: 0,
                background: "var(--bg-1)",
                border: "1px solid var(--border-2)",
                borderRadius: 8,
                padding: "10px 14px",
                zIndex: 999,
                minWidth: 220,
                boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", marginBottom: 8 }}>Keyboard Shortcuts</div>
                {SHORTCUT_LIST.map((s) => (
                  <div key={s.keys} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "2px 0", fontSize: 10 }}>
                    <span className="mono" style={{ color: "var(--cyan)", fontWeight: 600 }}>{s.keys}</span>
                    <span style={{ color: "var(--text-4)" }}>{s.description}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
});
Footer.displayName = "Footer";
export default Footer;
