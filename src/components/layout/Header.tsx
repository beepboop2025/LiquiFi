import { memo } from "react";
import { Bell, DollarSign, Users } from "lucide-react";
import RateTicker, { type RateTickerItem } from "./RateTicker";
import type { AppBackendState } from "../../types";

interface HeaderProps {
  backend: AppBackendState;
  time: Date;
  alertCount: number;
  rateItems: RateTickerItem[];
  backendConnected: boolean;
}

const Header = memo<HeaderProps>(function Header({ backend, time, alertCount, rateItems, backendConnected }) {
  return (
    <header style={{ borderBottom: "1px solid var(--border-1)", position: "relative", zIndex: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 56, padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: "linear-gradient(135deg, var(--cyan), var(--blue))", display: "flex", alignItems: "center", justifyContent: "center", animation: "breathe 3s ease-in-out infinite" }}>
            <DollarSign size={16} color="white" strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text-0)" }}>LiquiFi</span>
          <span style={{ fontSize: 9, color: "var(--cyan)", background: "rgba(6,214,224,0.08)", padding: "3px 10px", borderRadius: 20, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", border: "1px solid rgba(6,214,224,0.15)" }}>
            Autonomous Treasury AI
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ position: "relative" }}>
            <Bell size={16} color="var(--text-2)" />
            <span style={{ position: "absolute", top: -4, right: -6, background: "var(--red)", color: "white", fontSize: 8, fontWeight: 700, width: 14, height: 14, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>{alertCount}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span className={`status-dot ${backend.circuitOpen ? "warn" : "live"}`} />
            <span className="mono" style={{ fontSize: 10, color: backend.circuitOpen ? "var(--amber)" : "var(--text-2)" }}>
              {backend.circuitOpen ? "DEGRADED" : "LIVE"}
            </span>
            <span className="mono" style={{ fontSize: 9, color: backendConnected ? "var(--cyan)" : "var(--text-4)", background: backendConnected ? "rgba(6,214,224,0.08)" : "var(--bg-2)", padding: "2px 6px", borderRadius: 3, border: `1px solid ${backendConnected ? "rgba(6,214,224,0.2)" : "var(--border-1)"}` }}>
              {backendConnected ? "RBI" : "Local"}
            </span>
          </div>
          <span className="mono" style={{ fontSize: 10, color: "var(--text-4)" }}>Queue: {backend.queueDepth}</span>
          <span className="mono" style={{ fontSize: 10, color: backend.killSwitch ? "var(--red)" : "var(--text-4)" }}>
            Kill: {backend.killSwitch ? "ON" : "OFF"}
          </span>
          <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
            {time.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} IST
          </span>
          <span className="mono" style={{ fontSize: 10, color: "var(--text-4)", background: "var(--bg-2)", padding: "4px 10px", borderRadius: 5, border: "1px solid var(--border-1)" }}>
            {time.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
          </span>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--bg-3)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border-2)" }}>
            <Users size={13} color="var(--text-3)" />
          </div>
        </div>
      </div>

      <RateTicker rateItems={rateItems} />
    </header>
  );
});
Header.displayName = "Header";
export default Header;
