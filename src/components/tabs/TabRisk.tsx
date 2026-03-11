import { useEffect, useState } from "react";
import {
  Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ComposedChart, Line, Cell, Legend,
} from "recharts";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Download,
  Flame,
  Gauge,
  GitMerge,
  Layers,
  Lock,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import { COMPLIANCE_ITEMS, STRESS_SCENARIOS } from "../../constants/compliance";
import { COUNTERPARTIES } from "../../constants/counterparties";
import { DEPLOYMENT_PORTFOLIO } from "../../constants/instruments";
import { DEMO_ALM_DATA, DEMO_LCR_NSFR } from "../../constants/regulatory";
import { fetchALMCurrent, fetchALMLiquidity } from "../../services/api";
import SectionTitle from "../shared/SectionTitle";
import StatBox from "../shared/StatBox";
import StatusBadge from "../shared/StatusBadge";
import Tt from "../shared/Tt";

import type {
  AppBackendState,
  AlmBucket,
  LcrNsfr,
} from "../../types";

interface AlmChartDataPoint extends AlmBucket {
  fill: string;
}

const getLcrPct = (lcr: Record<string, unknown> | undefined): number =>
  Number((lcr as Record<string, unknown>)?.lcr_pct ?? (lcr as Record<string, unknown>)?.lcrPct ?? 0);
const getNsfrPct = (nsfr: Record<string, unknown> | undefined): number =>
  Number((nsfr as Record<string, unknown>)?.nsfr_pct ?? (nsfr as Record<string, unknown>)?.nsfrPct ?? 0);
const getGapToOutflowPct = (b: Record<string, unknown>): number =>
  Number(b.gapPct ?? b.gap_to_outflow_pct ?? 0);
const getCumulativeGap = (b: Record<string, unknown>): number =>
  Number(b.cumulativeGap ?? b.cumulative_gap ?? 0);

interface TabRiskProps {
  backend: AppBackendState;
  onExportAuditTrail: () => void;
}

export default function TabRisk({ backend, onExportAuditTrail }: TabRiskProps) {
  const [almData, setAlmData] = useState<AlmBucket[]>(DEMO_ALM_DATA);
  const [lcrNsfr, setLcrNsfr] = useState<LcrNsfr>(DEMO_LCR_NSFR);

  useEffect(() => {
    fetchALMCurrent().then((d: AlmBucket[] | null) => { if (d) setAlmData(d); }).catch((err) => console.error('ALM fetch failed:', err));
    fetchALMLiquidity().then((d: LcrNsfr | null) => { if (d) setLcrNsfr(d); }).catch((err) => console.error('ALM fetch failed:', err));
  }, []);

  const compliancePasses = COMPLIANCE_ITEMS.filter((item) => item.status === "pass").length;
  const complianceScore = Math.max(90, 100 - (backend.circuitOpen ? 3.5 : 0) - backend.failedTx24h * 0.05);
  const var99 = +(18.5 + backend.failedTx24h * 0.12 + (backend.circuitOpen ? 1.5 : 0)).toFixed(1);
  const expectedShortfall = +(var99 * 1.31).toFixed(1);
  const totalExposure = COUNTERPARTIES.reduce((sum, cp) => sum + cp.exposure, 0);
  const concentrationRisk = +(totalExposure > 0 ? ((COUNTERPARTIES.slice(0, 3).reduce((sum, cp) => sum + cp.exposure, 0) / totalExposure) * 100) : 0).toFixed(1);

  const almChartData: AlmChartDataPoint[] = almData.map((b) => ({
    ...b,
    fill: b.gap >= 0 ? "var(--green)" : "var(--red)",
  }));

  const totalRSA = almData.reduce((s, b) => s + b.rsa, 0);
  const totalRSL = almData.reduce((s, b) => s + b.rsl, 0);
  const totalGap = totalRSA - totalRSL;
  const durationGap = totalRSA > 0 ? (2.8 + totalGap / totalRSA * 0.5).toFixed(2) : "0";
  const niiImpact = (totalGap * 0.01 * 0.4).toFixed(1);

  const instrumentLimits: Record<string, number> = { "CBLO": 50, "Call Money": 30, "Overnight Repo": 40, "Liquid MMF": 25, "T-Bill 91D": 20, "Notice Money 7D": 15, "CD 3M": 15, "CP 1M": 10 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <StatBox label="Portfolio VaR (99%)" value={`\u20B9${var99}Cr`} sub="Dynamic with backend incidents" color="var(--red)" icon={Gauge} />
        <StatBox label="Expected Shortfall" value={`\u20B9${expectedShortfall}Cr`} sub="Tail risk measure" color="var(--orange)" icon={AlertTriangle} />
        <StatBox label="Max Drawdown" value={`\u20B9${(6.2 + backend.failedTx24h * 0.02).toFixed(1)}Cr`} sub="30-day rolling" color="var(--amber)" icon={TrendingDown} />
        <StatBox label="Concentration Risk" value={`${concentrationRisk}%`} sub="Top 3 counterparties" color="var(--purple)" icon={Users} />
        <StatBox label="Compliance Score" value={`${complianceScore.toFixed(1)}%`} sub={`${compliancePasses}/13 base checks + runtime controls`} color={complianceScore > 97 ? "var(--green)" : "var(--amber)"} icon={ShieldCheck} />
      </div>

      {/* Instrument Exposure */}
      <div className="card">
        <SectionTitle icon={Layers} title="Instrument Exposure vs Regulatory Limits" subtitle="Real-time monitoring against RBI and internal policy constraints" color="var(--cyan)" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 10 }}>
          {DEPLOYMENT_PORTFOLIO.map((d, i) => {
            const limit = instrumentLimits[d.instrument] || 20;
            const usage = ((d.pct / limit) * 100).toFixed(0);
            const isWarn = Number(usage) > 70;
            const isDanger = Number(usage) > 85;
            return (
              <div key={i} className="anim-in" style={{
                background: "var(--bg-1)",
                borderRadius: 8,
                padding: 12,
                textAlign: "center",
                borderTop: `2px solid ${d.color}`,
                animationDelay: `${i * 50}ms`,
                transition: "all var(--duration-normal) var(--ease-smooth)",
                cursor: "default",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-md)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.transform = "";
                (e.currentTarget as HTMLDivElement).style.boxShadow = "";
              }}
              >
                <div style={{ fontSize: 9, color: "var(--text-3)", marginBottom: 6, fontWeight: 500 }}>{d.instrument}</div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: d.color }}>{d.pct}%</div>
                <div style={{ fontSize: 9, color: "var(--text-4)", marginTop: 2 }}>of {limit}% limit</div>
                <div className="progress-bar" style={{ marginTop: 6 }}>
                  <div className="progress-fill" style={{
                    width: `${Math.min(Number(usage), 100)}%`,
                    background: isDanger ? "var(--red)" : isWarn ? "var(--amber)" : d.color,
                    animationDelay: `${i * 80}ms`,
                  }} />
                </div>
                <div className="mono" style={{
                  fontSize: 9,
                  color: isDanger ? "var(--red)" : "var(--text-4)",
                  marginTop: 4,
                  fontWeight: isDanger ? 600 : 400,
                }}>{usage}% used</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {/* Stress Test */}
        <div className="card">
          <SectionTitle icon={Flame} title="Stress Test Scenarios" subtitle="Monte Carlo + historical VaR \u2022 multi-scenario sweep" color="var(--red)" badge={`${STRESS_SCENARIOS.length} scenarios`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {STRESS_SCENARIOS.map((s, i) => (
              <div key={i} className="anim-in" style={{
                background: "var(--bg-1)",
                borderRadius: 8,
                padding: 12,
                borderLeft: `3px solid ${s.severity === "critical" ? "var(--red)" : s.severity === "high" ? "var(--amber)" : "var(--blue)"}`,
                animationDelay: `${i * 70}ms`,
                transition: "all var(--duration-normal) var(--ease-smooth)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "var(--bg-3)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "var(--bg-1)";
              }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{s.scenario}</span>
                  <StatusBadge status={s.severity === "critical" ? "CANCELLED" : s.severity === "high" ? "PARTIAL" : "FILLED"} />
                </div>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 8 }}>{s.desc}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <div><span style={{ fontSize: 9, color: "var(--text-4)" }}>P&L Impact</span><div className="mono" style={{ fontSize: 14, fontWeight: 700, color: "var(--red)" }}>{"\u20B9"}{Math.abs(s.impact)}Cr</div></div>
                  <div><span style={{ fontSize: 9, color: "var(--text-4)" }}>Survival</span><div className="mono" style={{ fontSize: 14, fontWeight: 700, color: s.survival <= 6 ? "var(--red)" : "var(--amber)" }}>{s.survival}h</div></div>
                  <div><span style={{ fontSize: 9, color: "var(--text-4)" }}>Probability</span><div className="mono" style={{ fontSize: 14, fontWeight: 700, color: "var(--text-2)" }}>{s.probability}%</div></div>
                </div>
                <div style={{ marginTop: 6, fontSize: 10, color: "var(--teal)" }}>Mitigation: {s.mitigation}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Compliance Engine */}
        <div className="card">
          <SectionTitle icon={ShieldCheck} title="Compliance Engine" subtitle="RBI + SEBI + Tax + Audit + runtime controls" color="var(--green)" />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {["RBI", "SEBI", "Tax", "Audit"].map((cat) => (
              <div key={cat}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", padding: "8px 0 4px", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border-2)" }}>{cat}</div>
                {COMPLIANCE_ITEMS.filter((c) => c.category === cat).map((c, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "2.5fr 1.2fr 0.8fr 0.5fr", padding: "8px 0", borderBottom: "1px solid var(--border-1)", alignItems: "center", transition: "background var(--duration-fast) var(--ease-smooth)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(30,48,80,0.15)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                  >
                    <span style={{ fontSize: 11, color: "var(--text-2)" }}>{c.item}</span>
                    <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: c.status === "pass" ? "var(--green)" : "var(--amber)" }}>
                      {typeof c.value === "number" ? `${c.value}${c.unit}` : c.value}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-4)" }}>{typeof c.threshold === "number" ? `>${c.threshold}${c.unit}` : c.threshold}</span>
                    {c.status === "pass" ? <CheckCircle size={13} color="var(--green)" /> : <AlertCircle size={13} color="var(--amber)" />}
                  </div>
                ))}
              </div>
            ))}
            <div style={{ display: "grid", gridTemplateColumns: "2.5fr 1.2fr 0.8fr 0.5fr", padding: "8px 0", borderBottom: "1px solid var(--border-1)", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--text-2)" }}>Execution Circuit Breaker</span>
              <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: backend.circuitOpen ? "var(--red)" : "var(--green)", transition: "color var(--duration-slow) var(--ease-smooth)" }}>
                {backend.circuitOpen ? "OPEN" : "CLOSED"}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-4)" }}>Must stay CLOSED</span>
              {backend.circuitOpen ? <AlertCircle size={13} color="var(--red)" /> : <CheckCircle size={13} color="var(--green)" />}
            </div>
          </div>
        </div>
      </div>

      {/* Audit Trail */}
      <div className="card">
        <SectionTitle icon={Lock} title="Immutable Audit Trail" subtitle="Tamper-evident logs for decisions, executions, and safeguards" color="var(--blue)" right={<button className="btn-ghost" onClick={onExportAuditTrail}><Download size={12} /> Export for Regulator</button>} />
        <div className="scrollbar-thin" style={{ maxHeight: 220, overflowY: "auto" }}>
          {backend.auditTrail.map((log, idx) => (
            <div key={log.id} className="table-row anim-row" style={{ gridTemplateColumns: "0.8fr 1fr 3fr 1.2fr 1fr", display: "grid", animationDelay: `${Math.min(idx * 20, 200)}ms` }}>
              <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{log.time}</span>
              <span className="badge mono" style={{ background: "var(--bg-1)", color: log.level === "error" ? "var(--red)" : log.level === "warn" ? "var(--amber)" : "var(--cyan)", justifySelf: "start" }}>{log.action}</span>
              <span style={{ fontSize: 11, color: "var(--text-2)" }}>{log.detail}</span>
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>{log.user}</span>
              <span className="mono" style={{ fontSize: 9, color: "var(--text-4)" }}>LOCK {log.hash}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ALM Gap Analysis */}
      <div className="card">
        <SectionTitle
          icon={GitMerge}
          title="ALM Gap Analysis"
          subtitle="Structural Liquidity Statement \u2014 10 RBI time buckets per Master Circular on ALM System"
          color="var(--teal)"
          badge="10 buckets"
        />
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={almChartData}>
            <defs>
              <linearGradient id="gAlmGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.3} />
              </linearGradient>
              <linearGradient id="gAlmRed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.7} />
                <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,48,80,0.18)" />
            <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "var(--text-3)" }} />
            <YAxis tick={{ fontSize: 9, fill: "var(--text-4)" }} label={{ value: "\u20B9 Cr", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "var(--text-4)" } }} />
            <Tooltip content={<Tt />} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <ReferenceLine y={0} stroke="var(--text-4)" strokeWidth={1} />
            <Bar dataKey="gap" name="Gap (RSA - RSL)" animationDuration={1000}>
              {almChartData.map((entry, i) => (
                <Cell key={i} fill={entry.gap >= 0 ? "url(#gAlmGreen)" : "url(#gAlmRed)"} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="cumulativeGap" stroke="var(--cyan)" strokeWidth={2} dot={{ r: 3, fill: "var(--cyan)" }} name="Cumulative Gap" yAxisId={0} animationDuration={1200} />
          </ComposedChart>
        </ResponsiveContainer>

        {/* ALM Detail Table */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1fr 1fr 0.8fr 0.8fr 0.8fr 0.6fr 0.6fr", padding: "8px 0", borderBottom: "2px solid var(--border-2)", gap: 4 }}>
            {["Bucket", "RSA (Cr)", "RSL (Cr)", "Gap (Cr)", "Cum. Gap", "Gap/Outflow %", "RBI Limit", "Status"].map((h) => (
              <span key={h} style={{ fontSize: 9, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase" }}>{h}</span>
            ))}
          </div>
          {almData.map((b, idx) => {
            const bRec = b as unknown as Record<string, unknown>;
            const gapPctVal = getGapToOutflowPct(bRec);
            const cumGap = getCumulativeGap(bRec);
            const status: "pass" | "warn" | "fail" = (bRec.status as "pass" | "warn" | "fail") || (b.limit != null && Math.abs(gapPctVal) > b.limit ? "fail" : b.limit != null && Math.abs(gapPctVal) > b.limit * 0.8 ? "warn" : "pass");
            return (
              <div key={b.bucket} className="anim-row" style={{
                display: "grid",
                gridTemplateColumns: "0.8fr 1fr 1fr 0.8fr 0.8fr 0.8fr 0.6fr 0.6fr",
                padding: "8px 0",
                borderBottom: "1px solid var(--border-1)",
                alignItems: "center",
                gap: 4,
                animationDelay: `${idx * 30}ms`,
                transition: "background var(--duration-fast) var(--ease-smooth)",
              }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(30,48,80,0.15)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-1)" }}>{b.bucket}</span>
                <span className="mono" style={{ fontSize: 12, color: "var(--text-1)" }}>{(b.rsa || 0).toLocaleString()}</span>
                <span className="mono" style={{ fontSize: 12, color: "var(--text-1)" }}>{(b.rsl || 0).toLocaleString()}</span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: (b.gap || 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                  {(b.gap || 0) >= 0 ? "+" : ""}{(b.gap || 0).toLocaleString()}
                </span>
                <span className="mono" style={{ fontSize: 12, color: "var(--text-2)" }}>{cumGap.toLocaleString()}</span>
                <span className="mono" style={{ fontSize: 12, color: Math.abs(gapPctVal) > (b.limit || 100) ? "var(--red)" : "var(--text-2)" }}>
                  {gapPctVal.toFixed(1)}%
                </span>
                <span style={{ fontSize: 10, color: "var(--text-3)" }}>{b.limit != null ? `${b.limit}%` : "\u2014"}</span>
                <span>
                  {status === "pass" && <CheckCircle size={13} color="var(--green)" />}
                  {status === "warn" && <AlertTriangle size={13} color="var(--amber)" />}
                  {status === "fail" && <AlertCircle size={13} color="var(--red)" />}
                </span>
              </div>
            );
          })}
          {/* Totals row */}
          <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1fr 1fr 0.8fr 0.8fr 0.8fr 0.6fr 0.6fr", padding: "10px 0", borderTop: "2px solid var(--border-2)", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)" }}>TOTAL</span>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)" }}>{totalRSA.toLocaleString()}</span>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: "var(--text-1)" }}>{totalRSL.toLocaleString()}</span>
            <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: totalGap >= 0 ? "var(--green)" : "var(--red)" }}>
              {totalGap >= 0 ? "+" : ""}{totalGap.toLocaleString()}
            </span>
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>

      {/* IRRBB + LCR/NSFR */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div className="card">
          <SectionTitle icon={TrendingUp} title="Interest Rate Risk (IRRBB)" subtitle="Per RBI/2022-23/180 \u2014 EVE, NII, Duration Gap, EaR" color="var(--purple)" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              { label: "EVE Sensitivity (+100bps)", value: `\u20B9${(totalRSA * 0.012 - totalRSL * 0.010).toFixed(0)} Cr`, color: "var(--amber)" },
              { label: "NII Impact (+100bps)", value: `\u20B9${niiImpact} Cr`, color: Number(niiImpact) >= 0 ? "var(--green)" : "var(--red)" },
              { label: "Duration Gap", value: `${durationGap} yrs`, color: "var(--text-1)" },
              { label: "Earnings at Risk", value: `${totalRSA > 0 ? (Math.abs(totalGap) / totalRSA * 100 * 0.15).toFixed(2) : "0"}%`, color: "var(--text-1)" },
            ].map((item, i) => (
              <div key={i} style={{
                background: "var(--bg-1)",
                borderRadius: 8,
                padding: 12,
                textAlign: "center",
                transition: "all var(--duration-normal) var(--ease-smooth)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--bg-3)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--bg-1)"; }}
              >
                <div style={{ fontSize: 9, color: "var(--text-4)" }}>{item.label}</div>
                <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <SectionTitle icon={ShieldCheck} title="LCR / NSFR Summary" subtitle="Basel III liquidity compliance indicators" color="var(--green)" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {[
              { label: "LCR", pct: getLcrPct(lcrNsfr.lcr as Record<string, unknown>), desc: "Min 100% \u2014 HQLA / Net outflows (30d)" },
              { label: "NSFR", pct: getNsfrPct(lcrNsfr.nsfr as Record<string, unknown>), desc: "Min 100% \u2014 ASF / RSF" },
            ].map((ratio) => (
              <div key={ratio.label} style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{ratio.label}</span>
                  <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: ratio.pct >= 100 ? "var(--green)" : "var(--red)", transition: "color var(--duration-slow) var(--ease-smooth)" }}>
                    {ratio.pct.toFixed(1)}%
                  </span>
                </div>
                <div className="progress-bar" style={{ height: 5 }}>
                  <div className="progress-fill" style={{
                    width: `${Math.min(ratio.pct, 150) / 1.5}%`,
                    background: ratio.pct >= 100 ? "linear-gradient(90deg, var(--green), var(--green-dim))" : "linear-gradient(90deg, var(--red), var(--red-dim))",
                  }} />
                </div>
                <div style={{ fontSize: 9, color: "var(--text-4)", marginTop: 4 }}>{ratio.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
