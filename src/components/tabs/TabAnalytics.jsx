import { useMemo } from "react";
import {
  AlertCircle,
  CheckCircle,
  Brain,
  Briefcase,
  Target,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PERF_METRICS } from "../../constants/performance.js";
import { rand } from "../../utils/math.js";
import MiniSparkline from "../shared/MiniSparkline.jsx";
import SectionTitle from "../shared/SectionTitle.jsx";
import Tt from "../shared/Tt.jsx";

export default function TabAnalytics() {
  const yieldBreakdownData = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({
      month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i],
      liquifi: rand(120, 180),
      fd: rand(55, 75),
    })),
    []
  );

  const mapeTrendData = useMemo(
    () => Array.from({ length: 30 }, (_, i) => ({
      day: `D${i + 1}`,
      mape: Math.max(2, 8 - i * 0.18 + rand(-0.5, 0.5)),
      target: 5,
    })),
    []
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="card card-glow">
        <SectionTitle icon={Target} title="Performance Scoreboard" subtitle="vs Success Criteria targets — real-time KPI tracking" color="var(--green)" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {Object.entries(PERF_METRICS).map(([key, m], i) => {
            const achieved = key === "predictionMAPE" || key === "avgDeploymentTime" ? m.value <= m.target : m.value >= m.target;
            return (
              <div key={i} style={{ background: "var(--bg-1)", borderRadius: 10, padding: 16, borderTop: `2px solid ${achieved ? "var(--green)" : "var(--amber)"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase" }}>{m.label}</span>
                  {achieved ? <CheckCircle size={14} color="var(--green)" /> : <AlertCircle size={14} color="var(--amber)" />}
                </div>
                <div className="mono" style={{ fontSize: 28, fontWeight: 800, color: achieved ? "var(--green)" : "var(--amber)" }}>{m.value}{m.unit}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                  <span style={{ fontSize: 10, color: "var(--text-4)" }}>Target: {m.target}{m.unit}</span>
                  <MiniSparkline data={m.trend} color={achieved ? "#10b981" : "#f59e0b"} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div className="card">
          <SectionTitle icon={TrendingUp} title="Yield Enhancement Breakdown" subtitle="Basis points earned above static bank fixed deposit" color="var(--cyan)" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={yieldBreakdownData}>
              <CartesianGrid strokeDasharray="3 6" stroke="rgba(30,37,64,0.5)" />
              <XAxis dataKey="month" tick={{ fill: "#475569", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={{ stroke: "#1a2540" }} tickLine={false} />
              <YAxis tick={{ fill: "#475569", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}bps`} />
              <Tooltip content={<Tt />} />
              <Bar dataKey="liquifi" fill="var(--cyan)" radius={[3, 3, 0, 0]} name="LiquiFi Yield (bps)" />
              <Bar dataKey="fd" fill="var(--border-2)" radius={[3, 3, 0, 0]} name="FD Benchmark (bps)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <SectionTitle icon={Brain} title="Prediction Accuracy Trend" subtitle="MAPE (Mean Absolute Percentage Error) — lower is better" color="var(--purple)" />
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={mapeTrendData}>
              <defs>
                <linearGradient id="gMape" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" stopOpacity={0.2} /><stop offset="100%" stopColor="#a78bfa" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="rgba(30,37,64,0.5)" />
              <XAxis dataKey="day" tick={false} axisLine={{ stroke: "#1a2540" }} />
              <YAxis tick={{ fill: "#475569", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 10]} />
              <Tooltip content={<Tt />} />
              <Area type="monotone" dataKey="mape" stroke="#a78bfa" strokeWidth={2} fill="url(#gMape)" name="MAPE" />
              <ReferenceLine y={5} stroke="#f59e0b66" strokeDasharray="6 3" label={{ value: "Target 5%", fill: "#f59e0b", fontSize: 9 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <SectionTitle icon={Briefcase} title="Operational Efficiency" subtitle="Manual operations reduction, settlement tracking, and system health" color="var(--teal)" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
          {[
            { label: "Total Trades (MTD)", value: "342", sub: "₹8,400Cr volume", color: "var(--cyan)" },
            { label: "Auto-Executed", value: "312", sub: "91.2% automation rate", color: "var(--green)" },
            { label: "Manual Overrides", value: "30", sub: "CFO/Treasurer approved", color: "var(--amber)" },
            { label: "Settlement Success", value: "100%", sub: "342/342 on-time", color: "var(--green)" },
            { label: "System Uptime", value: "99.97%", sub: "2.6min downtime MTD", color: "var(--green)" },
            { label: "API Latency", value: "23ms", sub: "P99 across all integrations", color: "var(--cyan)" },
          ].map((m, i) => (
            <div key={i} style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "var(--text-4)", marginBottom: 6, textTransform: "uppercase" }}>{m.label}</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: m.color }}>{m.value}</div>
              <div style={{ fontSize: 9, color: "var(--text-3)", marginTop: 4 }}>{m.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
