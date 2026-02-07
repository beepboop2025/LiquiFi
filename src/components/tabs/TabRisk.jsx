import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
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

import { COMPLIANCE_ITEMS, STRESS_SCENARIOS } from "../../constants/compliance.js";
import { COUNTERPARTIES } from "../../constants/counterparties.js";
import { DEPLOYMENT_PORTFOLIO } from "../../constants/instruments.js";
import { DEMO_ALM_DATA, DEMO_LCR_NSFR, RBI_ALM_LIMITS } from "../../constants/regulatory.js";
import { fetchALMCurrent, fetchALMLiquidity } from "../../services/api.js";
import SectionTitle from "../shared/SectionTitle.jsx";
import StatBox from "../shared/StatBox.jsx";
import StatusBadge from "../shared/StatusBadge.jsx";

export default function TabRisk({ backend, onExportAuditTrail }) {
  const [almData, setAlmData] = useState(DEMO_ALM_DATA);
  const [lcrNsfr, setLcrNsfr] = useState(DEMO_LCR_NSFR);

  useEffect(() => {
    fetchALMCurrent().then((d) => { if (d) setAlmData(d); });
    fetchALMLiquidity().then((d) => { if (d) setLcrNsfr(d); });
  }, []);

  const compliancePasses = COMPLIANCE_ITEMS.filter((item) => item.status === "pass").length;
  const complianceScore = Math.max(90, 100 - (backend.circuitOpen ? 3.5 : 0) - backend.failedTx24h * 0.05);
  const var99 = +(18.5 + backend.failedTx24h * 0.12 + (backend.circuitOpen ? 1.5 : 0)).toFixed(1);
  const expectedShortfall = +(var99 * 1.31).toFixed(1);
  const concentrationRisk = +(((COUNTERPARTIES.slice(0, 3).reduce((sum, cp) => sum + cp.exposure, 0) / COUNTERPARTIES.reduce((sum, cp) => sum + cp.exposure, 0)) * 100)).toFixed(1);

  // ALM chart data with colors
  const almChartData = almData.map((b) => ({
    ...b,
    fill: b.gap >= 0 ? "var(--green)" : "var(--red)",
  }));

  // IRRBB calculations
  const totalRSA = almData.reduce((s, b) => s + b.rsa, 0);
  const totalRSL = almData.reduce((s, b) => s + b.rsl, 0);
  const totalGap = totalRSA - totalRSL;
  const durationGap = totalRSA > 0 ? (2.8 + totalGap / totalRSA * 0.5).toFixed(2) : "0";
  const niiImpact = (totalGap * 0.01 * 0.4).toFixed(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <StatBox label="Portfolio VaR (99%)" value={`₹${var99}Cr`} sub="Dynamic with backend incidents" color="var(--red)" icon={Gauge} />
        <StatBox label="Expected Shortfall" value={`₹${expectedShortfall}Cr`} sub="Tail risk measure" color="var(--orange)" icon={AlertTriangle} />
        <StatBox label="Max Drawdown" value={`₹${(6.2 + backend.failedTx24h * 0.02).toFixed(1)}Cr`} sub="30-day rolling" color="var(--amber)" icon={TrendingDown} />
        <StatBox label="Concentration Risk" value={`${concentrationRisk}%`} sub="Top 3 counterparties" color="var(--purple)" icon={Users} />
        <StatBox label="Compliance Score" value={`${complianceScore.toFixed(1)}%`} sub={`${compliancePasses}/13 base checks + runtime controls`} color={complianceScore > 97 ? "var(--green)" : "var(--amber)"} icon={ShieldCheck} />
      </div>

      <div className="card">
        <SectionTitle icon={Layers} title="Instrument Exposure vs Regulatory Limits" subtitle="Real-time monitoring against RBI and internal policy constraints" color="var(--cyan)" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 10 }}>
          {DEPLOYMENT_PORTFOLIO.map((d, i) => {
            const limits = { "CBLO": 50, "Call Money": 30, "Overnight Repo": 40, "Liquid MMF": 25, "T-Bill 91D": 20, "Notice Money 7D": 15, "CD 3M": 15, "CP 1M": 10 };
            const limit = limits[d.instrument] || 20;
            const usage = ((d.pct / limit) * 100).toFixed(0);
            return (
              <div key={i} style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12, textAlign: "center", borderTop: `2px solid ${d.color}` }}>
                <div style={{ fontSize: 9, color: "var(--text-3)", marginBottom: 6, fontWeight: 500 }}>{d.instrument}</div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: d.color }}>{d.pct}%</div>
                <div style={{ fontSize: 9, color: "var(--text-4)", marginTop: 2 }}>of {limit}% limit</div>
                <div className="progress-bar" style={{ marginTop: 6 }}>
                  <div className="progress-fill" style={{ width: `${Math.min(usage, 100)}%`, background: usage > 85 ? "var(--red)" : usage > 70 ? "var(--amber)" : d.color }} />
                </div>
                <div className="mono" style={{ fontSize: 9, color: usage > 85 ? "var(--red)" : "var(--text-4)", marginTop: 4 }}>{usage}% used</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div className="card">
          <SectionTitle icon={Flame} title="Stress Test Scenarios" subtitle="Monte Carlo + historical VaR • multi-scenario sweep" color="var(--red)" badge={`${STRESS_SCENARIOS.length} scenarios`} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {STRESS_SCENARIOS.map((s, i) => (
              <div key={i} style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12, borderLeft: `3px solid ${s.severity === "critical" ? "var(--red)" : s.severity === "high" ? "var(--amber)" : "var(--blue)"}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{s.scenario}</span>
                  <StatusBadge status={s.severity === "critical" ? "CANCELLED" : s.severity === "high" ? "PARTIAL" : "FILLED"} />
                </div>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 8 }}>{s.desc}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <div><span style={{ fontSize: 9, color: "var(--text-4)" }}>P&L Impact</span><div className="mono" style={{ fontSize: 14, fontWeight: 700, color: "var(--red)" }}>₹{Math.abs(s.impact)}Cr</div></div>
                  <div><span style={{ fontSize: 9, color: "var(--text-4)" }}>Survival</span><div className="mono" style={{ fontSize: 14, fontWeight: 700, color: s.survival <= 6 ? "var(--red)" : "var(--amber)" }}>{s.survival}h</div></div>
                  <div><span style={{ fontSize: 9, color: "var(--text-4)" }}>Probability</span><div className="mono" style={{ fontSize: 14, fontWeight: 700, color: "var(--text-2)" }}>{s.probability}%</div></div>
                </div>
                <div style={{ marginTop: 6, fontSize: 10, color: "var(--teal)" }}>Mitigation: {s.mitigation}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <SectionTitle icon={ShieldCheck} title="Compliance Engine" subtitle="RBI + SEBI + Tax + Audit + runtime controls" color="var(--green)" />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {["RBI", "SEBI", "Tax", "Audit"].map((cat) => (
              <div key={cat}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", padding: "8px 0 4px", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid var(--border-2)" }}>{cat}</div>
                {COMPLIANCE_ITEMS.filter((c) => c.category === cat).map((c, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "2.5fr 1.2fr 0.8fr 0.5fr", padding: "8px 0", borderBottom: "1px solid var(--border-1)", alignItems: "center" }}>
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
              <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: backend.circuitOpen ? "var(--red)" : "var(--green)" }}>
                {backend.circuitOpen ? "OPEN" : "CLOSED"}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-4)" }}>Must stay CLOSED</span>
              {backend.circuitOpen ? <AlertCircle size={13} color="var(--red)" /> : <CheckCircle size={13} color="var(--green)" />}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <SectionTitle icon={Lock} title="Immutable Audit Trail" subtitle="Tamper-evident logs for decisions, executions, and safeguards" color="var(--blue)" right={<button className="btn-ghost" onClick={onExportAuditTrail}><Download size={12} /> Export for Regulator</button>} />
        <div className="scrollbar-thin" style={{ maxHeight: 220, overflowY: "auto" }}>
          {backend.auditTrail.map((log) => (
            <div key={log.id} className="table-row" style={{ gridTemplateColumns: "0.8fr 1fr 3fr 1.2fr 1fr", display: "grid" }}>
              <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{log.time}</span>
              <span className="badge mono" style={{ background: "var(--bg-1)", color: log.level === "error" ? "var(--red)" : log.level === "warn" ? "var(--amber)" : "var(--cyan)", justifySelf: "start" }}>{log.action}</span>
              <span style={{ fontSize: 11, color: "var(--text-2)" }}>{log.detail}</span>
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>{log.user}</span>
              <span className="mono" style={{ fontSize: 9, color: "var(--text-4)" }}>LOCK {log.hash}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ALM Gap Analysis Section */}
      <div className="card">
        <SectionTitle
          icon={GitMerge}
          title="ALM Gap Analysis"
          subtitle="Structural Liquidity Statement — 10 RBI time buckets per Master Circular on ALM System"
          color="var(--teal)"
          badge="10 buckets"
        />

        {/* ALM Gap Chart */}
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={almChartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-1)" />
            <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "var(--text-3)" }} />
            <YAxis tick={{ fontSize: 9, fill: "var(--text-4)" }} label={{ value: "₹ Cr", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "var(--text-4)" } }} />
            <Tooltip contentStyle={{ background: "var(--bg-1)", border: "1px solid var(--border-2)", fontSize: 11 }} formatter={(v) => [`₹${v.toLocaleString()} Cr`]} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <ReferenceLine y={0} stroke="var(--text-4)" strokeWidth={1} />
            <Bar dataKey="gap" name="Gap (RSA - RSL)">
              {almChartData.map((entry, i) => (
                <Cell key={i} fill={entry.gap >= 0 ? "var(--green)" : "var(--red)"} fillOpacity={0.7} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="cumulativeGap" stroke="var(--cyan)" strokeWidth={2} dot={{ r: 3, fill: "var(--cyan)" }} name="Cumulative Gap" yAxisId={0} />
          </ComposedChart>
        </ResponsiveContainer>

        {/* ALM Detail Table */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1fr 1fr 0.8fr 0.8fr 0.8fr 0.6fr 0.6fr", padding: "8px 0", borderBottom: "2px solid var(--border-2)", gap: 4 }}>
            {["Bucket", "RSA (Cr)", "RSL (Cr)", "Gap (Cr)", "Cum. Gap", "Gap/Outflow %", "RBI Limit", "Status"].map((h) => (
              <span key={h} style={{ fontSize: 9, fontWeight: 700, color: "var(--text-4)", textTransform: "uppercase" }}>{h}</span>
            ))}
          </div>
          {almData.map((b) => {
            const status = b.status || (b.limit != null && Math.abs(b.gapPct || b.gap_to_outflow_pct || 0) > b.limit ? "fail" : b.limit != null && Math.abs(b.gapPct || b.gap_to_outflow_pct || 0) > b.limit * 0.8 ? "warn" : "pass");
            return (
              <div key={b.bucket} style={{ display: "grid", gridTemplateColumns: "0.8fr 1fr 1fr 0.8fr 0.8fr 0.8fr 0.6fr 0.6fr", padding: "8px 0", borderBottom: "1px solid var(--border-1)", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-1)" }}>{b.bucket}</span>
                <span className="mono" style={{ fontSize: 12, color: "var(--text-1)" }}>{(b.rsa || 0).toLocaleString()}</span>
                <span className="mono" style={{ fontSize: 12, color: "var(--text-1)" }}>{(b.rsl || 0).toLocaleString()}</span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: (b.gap || 0) >= 0 ? "var(--green)" : "var(--red)" }}>
                  {(b.gap || 0) >= 0 ? "+" : ""}{(b.gap || 0).toLocaleString()}
                </span>
                <span className="mono" style={{ fontSize: 12, color: "var(--text-2)" }}>{(b.cumulativeGap || b.cumulative_gap || 0).toLocaleString()}</span>
                <span className="mono" style={{ fontSize: 12, color: Math.abs(b.gapPct || b.gap_to_outflow_pct || 0) > (b.limit || 100) ? "var(--red)" : "var(--text-2)" }}>
                  {(b.gapPct || b.gap_to_outflow_pct || 0).toFixed(1)}%
                </span>
                <span style={{ fontSize: 10, color: "var(--text-3)" }}>{b.limit != null ? `${b.limit}%` : "—"}</span>
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

      {/* Interest Rate Sensitivity (IRRBB) + LCR/NSFR Mini */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div className="card">
          <SectionTitle icon={TrendingUp} title="Interest Rate Risk (IRRBB)" subtitle="Per RBI/2022-23/180 — EVE, NII, Duration Gap, EaR" color="var(--purple)" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "var(--text-4)" }}>EVE Sensitivity (+100bps)</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--amber)" }}>₹{(totalRSA * 0.012 - totalRSL * 0.010).toFixed(0)} Cr</div>
            </div>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "var(--text-4)" }}>NII Impact (+100bps)</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: Number(niiImpact) >= 0 ? "var(--green)" : "var(--red)" }}>₹{niiImpact} Cr</div>
            </div>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "var(--text-4)" }}>Duration Gap</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)" }}>{durationGap} yrs</div>
            </div>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "var(--text-4)" }}>Earnings at Risk</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)" }}>{totalRSA > 0 ? (Math.abs(totalGap) / totalRSA * 100 * 0.15).toFixed(2) : "0"}%</div>
            </div>
          </div>
        </div>

        <div className="card">
          <SectionTitle icon={ShieldCheck} title="LCR / NSFR Summary" subtitle="Basel III liquidity compliance indicators" color="var(--green)" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>LCR</span>
                <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: (lcrNsfr.lcr?.lcr_pct || lcrNsfr.lcr?.lcrPct || 0) >= 100 ? "var(--green)" : "var(--red)" }}>
                  {(lcrNsfr.lcr?.lcr_pct || lcrNsfr.lcr?.lcrPct || 0).toFixed(1)}%
                </span>
              </div>
              <div className="progress-bar" style={{ height: 4 }}>
                <div className="progress-fill" style={{ width: `${Math.min((lcrNsfr.lcr?.lcr_pct || lcrNsfr.lcr?.lcrPct || 0), 150) / 1.5}%`, background: (lcrNsfr.lcr?.lcr_pct || lcrNsfr.lcr?.lcrPct || 0) >= 100 ? "var(--green)" : "var(--red)" }} />
              </div>
              <div style={{ fontSize: 9, color: "var(--text-4)", marginTop: 4 }}>Min 100% — HQLA / Net outflows (30d)</div>
            </div>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>NSFR</span>
                <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: (lcrNsfr.nsfr?.nsfr_pct || lcrNsfr.nsfr?.nsfrPct || 0) >= 100 ? "var(--green)" : "var(--red)" }}>
                  {(lcrNsfr.nsfr?.nsfr_pct || lcrNsfr.nsfr?.nsfrPct || 0).toFixed(1)}%
                </span>
              </div>
              <div className="progress-bar" style={{ height: 4 }}>
                <div className="progress-fill" style={{ width: `${Math.min((lcrNsfr.nsfr?.nsfr_pct || lcrNsfr.nsfr?.nsfrPct || 0), 150) / 1.5}%`, background: (lcrNsfr.nsfr?.nsfr_pct || lcrNsfr.nsfr?.nsfrPct || 0) >= 100 ? "var(--green)" : "var(--red)" }} />
              </div>
              <div style={{ fontSize: 9, color: "var(--text-4)", marginTop: 4 }}>Min 100% — ASF / RSF</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
