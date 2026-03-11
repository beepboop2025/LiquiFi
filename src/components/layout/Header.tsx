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
    <header className="header-bar">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 56, padding: "0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: "linear-gradient(135deg, var(--cyan), var(--blue))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            animation: "breathe 3s ease-in-out infinite",
            boxShadow: "0 2px 14px rgba(6, 214, 224, 0.25)",
          }}>
            <DollarSign size={16} color="white" strokeWidth={2.5} />
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text-0)" }}>LiquiFi</span>
          <span style={{
            fontSize: 9,
            color: "var(--cyan)",
            background: "rgba(6,214,224,0.06)",
            padding: "3px 10px",
            borderRadius: 20,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            border: "1px solid rgba(6,214,224,0.12)",
            backdropFilter: "blur(8px)",
            transition: "all var(--duration-normal) var(--ease-smooth)",
          }}>
            Autonomous Treasury AI
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Alert bell */}
          <div style={{
            position: "relative",
            cursor: "pointer",
            transition: "transform 0.2s var(--ease-smooth)",
            padding: 4,
          }}>
            <Bell size={16} color="var(--text-2)" />
            <span style={{
              position: "absolute",
              top: -2,
              right: -4,
              background: "var(--red)",
              color: "white",
              fontSize: 8,
              fontWeight: 700,
              width: 16,
              height: 16,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 10px rgba(239, 68, 68, 0.35)",
              animation: alertCount > 5 ? "pulse-glow 2s ease-in-out infinite" : "none",
              border: "1.5px solid var(--bg-0)",
            }}>
              {alertCount}
            </span>
          </div>

          {/* System status */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: backend.circuitOpen ? "rgba(245,158,11,0.06)" : "rgba(16,185,129,0.06)",
            padding: "4px 10px",
            borderRadius: 6,
            border: `1px solid ${backend.circuitOpen ? "rgba(245,158,11,0.15)" : "rgba(16,185,129,0.15)"}`,
            transition: "all var(--duration-slow) var(--ease-smooth)",
          }}>
            <span className={`status-dot ${backend.circuitOpen ? "warn" : "live"}`} />
            <span className="mono" style={{
              fontSize: 10,
              color: backend.circuitOpen ? "var(--amber)" : "var(--green)",
              fontWeight: 600,
              transition: "color var(--duration-slow) var(--ease-smooth)",
            }}>
              {backend.circuitOpen ? "DEGRADED" : "LIVE"}
            </span>
          </div>

          {/* Backend connection badge */}
          <span className="mono" style={{
            fontSize: 9,
            color: backendConnected ? "var(--cyan)" : "var(--text-4)",
            background: backendConnected ? "rgba(6,214,224,0.06)" : "rgba(15,23,42,0.5)",
            padding: "4px 10px",
            borderRadius: 6,
            border: `1px solid ${backendConnected ? "rgba(6,214,224,0.15)" : "var(--border-1)"}`,
            transition: "all var(--duration-slow) var(--ease-smooth)",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}>
            <span style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: backendConnected ? "var(--cyan)" : "var(--text-4)",
              display: "inline-block",
              animation: backendConnected ? "pulse-glow 2s ease-in-out infinite" : "none",
              transition: "background var(--duration-slow) var(--ease-smooth)",
            }} />
            {backendConnected ? "RBI" : "Local"}
          </span>

          <span className="mono" style={{ fontSize: 10, color: "var(--text-4)" }}>Queue: {backend.queueDepth}</span>
          <span className="mono" style={{
            fontSize: 10,
            color: backend.killSwitch ? "var(--red)" : "var(--text-4)",
            transition: "color var(--duration-slow) var(--ease-smooth)",
          }}>
            Kill: {backend.killSwitch ? "ON" : "OFF"}
          </span>

          {/* Clock */}
          <span className="mono" style={{
            fontSize: 11,
            color: "var(--text-2)",
            fontWeight: 500,
            background: "rgba(15, 23, 42, 0.4)",
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid var(--border-1)",
          }}>
            {time.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} IST
          </span>

          {/* Date */}
          <span className="mono" style={{
            fontSize: 10,
            color: "var(--text-4)",
            background: "rgba(15, 23, 42, 0.4)",
            padding: "4px 10px",
            borderRadius: 6,
            border: "1px solid var(--border-1)",
          }}>
            {time.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
          </span>

          {/* User avatar */}
          <div style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: "linear-gradient(135deg, rgba(30, 48, 80, 0.4), rgba(30, 48, 80, 0.2))",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--border-2)",
            cursor: "pointer",
            transition: "all var(--duration-normal) var(--ease-smooth)",
          }}>
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
