import { useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  Line,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  Brain,
  Calendar,
  CheckCircle,
  Database,
  GitBranch,
  RefreshCw,
  Target,
} from "lucide-react";

import { MONTE_CARLO_PATHS } from "../../constants/rates";
import { ERP_DATA } from "../../constants/erp";
import { resolveIcon } from "../../constants/iconMap";
import { generateMonteCarloSims } from "../../generators/monteCarlo";
import SectionTitle from "../shared/SectionTitle";
import StatBox from "../shared/StatBox";
import Tt from "../shared/Tt";

import type {
  ForecastPoint,
  CashFlowPoint,
  MonteCarloData,
  MonteCarloPoint,
} from "../../types";
import type { LucideIcon } from "lucide-react";

interface TabAIEngineProps {
  clockData: ForecastPoint[];
  cashFlowHistory: CashFlowPoint[];
  mcData: MonteCarloData | null;
}

export default function TabAIEngine({ clockData, cashFlowHistory, mcData }: TabAIEngineProps) {
  const [localPaths] = useState<MonteCarloPoint[][]>(() => generateMonteCarloSims());
  const mcPaths = useMemo<MonteCarloPoint[][]>(() => mcData?.paths || localPaths, [mcData, localPaths]);
  const mcFlat = useMemo<MonteCarloPoint[]>(() => mcPaths.flat(), [mcPaths]);
  const mcMetrics = mcData?.metrics || null;
  const laR_95 = mcMetrics ? mcMetrics.lar_95 : 18.5;
  const laR_99 = mcMetrics ? mcMetrics.lar_99 : 32.1;
  const expectedShortfall = mcMetrics ? mcMetrics.expected_shortfall : 24.3;
  const breachProb = mcMetrics ? mcMetrics.breach_probability : 4.2;

  const gapHours = clockData.filter((h) => h.predicted < h.min_buffer);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <StatBox label="Model Architecture" value="LSTM" sub="3-layer, 128 hidden units" color="var(--purple)" icon={Brain} />
        <StatBox label="Last Retrained" value="06:00" sub="Today • 90-day window" color="var(--cyan)" icon={RefreshCw} />
        <StatBox label="Forecast MAPE" value="3.8%" sub="7-day rolling average" color="var(--green)" icon={Target} />
        <StatBox label="Features Used" value="47" sub="Cash flows + rates + seasonality" color="var(--amber)" icon={Database} />
        <StatBox label="Confidence" value="96.2%" sub="95% CI within ±₹15Cr" color="var(--teal)" icon={CheckCircle} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
        <div className="card card-glow">
          <SectionTitle icon={GitBranch} title="Monte Carlo Simulation — Liquidity at Risk" subtitle={`${MONTE_CARLO_PATHS.toLocaleString()} simulation paths • 24-hour horizon • Geometric Brownian Motion`} color="var(--purple)" badge="LaR" />
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 6" stroke="rgba(30,37,64,0.5)" />
              <XAxis dataKey="hour" tick={{ fill: "#475569", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={{ stroke: "#1a2540" }} tickLine={false} label={{ value: "Hours", position: "insideBottom", offset: -5, fill: "#475569", fontSize: 9 }} />
              <YAxis tick={{ fill: "#475569", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}Cr`} />
              <Tooltip content={<Tt />} />
              <ReferenceLine y={120} stroke="#ef444466" strokeDasharray="6 3" label={{ value: "Min Buffer", fill: "#ef4444", fontSize: 9 }} />
              <Scatter data={mcFlat.filter((_, i) => i % 3 === 0)} fill="rgba(167,139,250,0.08)" name="₹ Sim Path" />
            </ScatterChart>
          </ResponsiveContainer>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 14 }}>
            <StatBox label="LaR (95%)" value={`₹${laR_95}Cr`} color="var(--amber)" small />
            <StatBox label="LaR (99%)" value={`₹${laR_99}Cr`} color="var(--red)" small />
            <StatBox label="Expected Shortfall" value={`₹${expectedShortfall}Cr`} color="var(--orange)" small />
            <StatBox label="Breach Probability" value={`${breachProb}%`} color="var(--red)" small />
          </div>
        </div>

        <div className="card">
          <SectionTitle icon={AlertTriangle} title="Gap Detection" subtitle="Predicted balance < Min buffer + Payment buffer" color="var(--red)" badge={gapHours.length > 0 ? `${gapHours.length} GAPS` : "CLEAR"} />
          {gapHours.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {gapHours.map((g, i) => (
                <div key={i} style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 8, padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--red)" }}>{g.hour} IST</span>
                    <span className="badge mono" style={{ background: "rgba(239,68,68,0.15)", color: "var(--red)" }}>BREACH</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div><span style={{ fontSize: 10, color: "var(--text-4)" }}>Predicted</span><div className="mono" style={{ fontSize: 14, fontWeight: 600, color: "var(--red)" }}>₹{g.predicted}Cr</div></div>
                    <div><span style={{ fontSize: 10, color: "var(--text-4)" }}>Shortfall</span><div className="mono" style={{ fontSize: 14, fontWeight: 600, color: "var(--red)" }}>₹{(g.min_buffer - g.predicted).toFixed(1)}Cr</div></div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, color: "var(--amber)" }}>Suggested: Borrow ₹{(g.min_buffer - g.predicted + 10).toFixed(0)}Cr via CBLO</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "40px 20px" }}>
              <CheckCircle size={32} color="var(--green)" style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--green)" }}>No Gaps Detected</p>
              <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>All predicted balances exceed minimum buffer for next 24 hours</p>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div className="card">
          <SectionTitle icon={BarChart3} title="90-Day Cash Flow History" subtitle="Training data for LSTM model • Payroll, GST, Advance Tax markers" color="var(--cyan)" />
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={cashFlowHistory}>
              <CartesianGrid strokeDasharray="3 6" stroke="rgba(30,37,64,0.5)" />
              <XAxis dataKey="label" tick={false} axisLine={{ stroke: "#1a2540" }} />
              <YAxis tick={{ fill: "#475569", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}Cr`} />
              <Tooltip content={<Tt />} />
              <Bar dataKey="inflow" fill="rgba(16,185,129,0.25)" radius={[2, 2, 0, 0]} name="₹ Inflow" />
              <Bar dataKey="outflow" fill="rgba(239,68,68,0.2)" radius={[2, 2, 0, 0]} name="₹ Outflow" />
              <Line type="monotone" dataKey="net" stroke="#06d6e0" strokeWidth={1.5} dot={false} name="₹ Net" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <SectionTitle icon={Database} title="ERP Forecast Data" subtitle="SAP / Oracle / Tally integration — payable & receivable pipeline" color="var(--orange)" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--red)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Payables Due</div>
              {ERP_DATA.payables.map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border-1)" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-1)" }}>{p.vendor}</div>
                    <div style={{ fontSize: 10, color: "var(--text-4)" }}>{p.due} • {p.erp}</div>
                  </div>
                  <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: "var(--red)" }}>₹{p.amount}Cr</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--green)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Receivables Expected</div>
              {ERP_DATA.receivables.map((r, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border-1)" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-1)" }}>{r.client}</div>
                    <div style={{ fontSize: 10, color: "var(--text-4)" }}>{r.expected} • {r.confidence}% conf</div>
                  </div>
                  <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: "var(--green)" }}>₹{r.amount}Cr</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <SectionTitle icon={Calendar} title="Upcoming Cash Flow Events" subtitle="Payroll, GST, Advance Tax, Bond Coupons — auto-detected from ERP" color="var(--amber)" />
        <div style={{ display: "flex", gap: 14 }}>
          {ERP_DATA.upcoming.map((ev, i) => {
            const Icon: LucideIcon = resolveIcon(ev.icon) || Calendar;
            return (
              <div key={i} style={{ flex: 1, background: "var(--bg-1)", borderRadius: 8, padding: 14, border: `1px solid ${ev.type === "outflow" ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.15)"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Icon size={14} color={ev.type === "outflow" ? "var(--red)" : "var(--green)"} />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{ev.event}</span>
                </div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: ev.type === "outflow" ? "var(--red)" : "var(--green)" }}>
                  {ev.type === "outflow" ? "-" : "+"}₹{ev.amount}Cr
                </div>
                <div style={{ fontSize: 10, color: "var(--text-4)", marginTop: 4 }}>{ev.date}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
