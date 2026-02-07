import { useCallback, useEffect, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, Legend,
} from "recharts";
import {
  AlertTriangle,
  CheckCircle,
  Download,
  FileText,
  Landmark,
  PieChart,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import {
  DEMO_CRR_SLR,
  DEMO_CRR_HISTORY,
  DEMO_SLR_HISTORY,
  DEMO_LCR_NSFR,
  RBI_POLICY_RATES,
  REPORT_TYPES,
} from "../../constants/regulatory.js";
import {
  fetchRegulatoryDashboard,
  fetchCRRHistory,
  fetchSLRHistory,
  fetchReports,
  generateReport,
} from "../../services/api.js";
import SectionTitle from "../shared/SectionTitle.jsx";
import StatBox from "../shared/StatBox.jsx";

export default function TabRegulatory() {
  const [dashboard, setDashboard] = useState(null);
  const [crrHistory, setCrrHistory] = useState(DEMO_CRR_HISTORY);
  const [slrHistory, setSlrHistory] = useState(DEMO_SLR_HISTORY);
  const [reports, setReports] = useState([]);
  const [generating, setGenerating] = useState(null);

  useEffect(() => {
    fetchRegulatoryDashboard().then((d) => { if (d) setDashboard(d); });
    fetchCRRHistory().then((d) => { if (d) setCrrHistory(d); });
    fetchSLRHistory().then((d) => { if (d) setSlrHistory(d); });
    fetchReports().then((d) => { if (d) setReports(d); });
  }, []);

  const cfg = dashboard?.config || {};
  const crr = dashboard?.crr || DEMO_CRR_SLR.crr;
  const slr = dashboard?.slr || DEMO_CRR_SLR.slr;
  const lcr = dashboard?.lcr || DEMO_LCR_NSFR.lcr;
  const nsfr = dashboard?.nsfr || DEMO_LCR_NSFR.nsfr;
  const ndtl = cfg.ndtl || DEMO_CRR_SLR.ndtl;

  const handleGenerate = useCallback(async (reportType) => {
    setGenerating(reportType);
    const result = await generateReport(reportType);
    if (result) {
      fetchReports().then((d) => { if (d) setReports(d); });
    }
    setGenerating(null);
  }, []);

  const crrStatus = (crr.surplus || 0) >= 0;
  const slrStatus = (slr.surplus || 0) >= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Section 1: RBI Policy Dashboard */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <StatBox label="Repo Rate" value={`${cfg.repo_rate || RBI_POLICY_RATES.repo}%`} sub="RBI LAF corridor" color="var(--cyan)" icon={Landmark} />
        <StatBox label="SDF Rate" value={`${cfg.sdf_rate || RBI_POLICY_RATES.sdf}%`} sub="Standing Deposit Facility" color="var(--blue)" icon={TrendingUp} />
        <StatBox label="MSF Rate" value={`${cfg.msf_rate || RBI_POLICY_RATES.msf}%`} sub="Marginal Standing Facility" color="var(--purple)" icon={TrendingUp} />
        <StatBox label="CRR Rate" value={`${cfg.crr_rate || RBI_POLICY_RATES.crr}%`} sub="Cash Reserve Ratio" color="var(--green)" icon={ShieldCheck} />
        <StatBox label="SLR Rate" value={`${cfg.slr_rate || RBI_POLICY_RATES.slr}%`} sub="Statutory Liquidity Ratio" color="var(--amber)" icon={ShieldCheck} />
        <StatBox label="NDTL" value={`₹${(ndtl / 1000).toFixed(0)}K Cr`} sub="Net Demand & Time Liabilities" color="var(--text-1)" icon={PieChart} />
      </div>

      {/* Section 2: CRR/SLR Compliance */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {/* CRR Card */}
        <div className="card">
          <SectionTitle
            icon={ShieldCheck}
            title="CRR Position"
            subtitle="Cash Reserve Ratio — RBI/2025-26/148"
            color={crrStatus ? "var(--green)" : "var(--red)"}
            badge={crrStatus ? "COMPLIANT" : "ALERT"}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "var(--text-4)", marginBottom: 4 }}>REQUIRED</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>₹{(crr.required || 0).toLocaleString()} Cr</div>
            </div>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "var(--text-4)", marginBottom: 4 }}>MAINTAINED</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: crrStatus ? "var(--green)" : "var(--red)" }}>₹{(crr.maintained || 0).toLocaleString()} Cr</div>
            </div>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "var(--text-4)", marginBottom: 4 }}>SURPLUS / DEFICIT</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: crrStatus ? "var(--green)" : "var(--red)" }}>
                {(crr.surplus || 0) >= 0 ? "+" : ""}₹{(crr.surplus || 0).toLocaleString()} Cr
              </div>
            </div>
          </div>
          <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 8 }}>
            Fortnight: {cfg.fortnight_start || "—"} to {cfg.fortnight_end || "—"} (1st-15th or 16th-last per Banking Laws Amendment 2025)
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={crrHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-1)" />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--text-4)" }} interval={4} />
              <YAxis tick={{ fontSize: 9, fill: "var(--text-4)" }} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: "var(--bg-1)", border: "1px solid var(--border-2)", fontSize: 11 }} />
              <Area type="monotone" dataKey="maintained" stroke="var(--green)" fill="var(--green)" fillOpacity={0.15} name="Maintained" />
              <ReferenceLine y={crr.required || 2250} stroke="var(--red)" strokeDasharray="5 5" label={{ value: "Required", fill: "var(--red)", fontSize: 9, position: "right" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* SLR Card */}
        <div className="card">
          <SectionTitle
            icon={ShieldCheck}
            title="SLR Position"
            subtitle="Statutory Liquidity Ratio — G-Sec + T-Bills + SDF"
            color={slrStatus ? "var(--green)" : "var(--red)"}
            badge={slrStatus ? "COMPLIANT" : "ALERT"}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "var(--text-4)", marginBottom: 4 }}>REQUIRED</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)" }}>₹{(slr.required || 0).toLocaleString()} Cr</div>
            </div>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "var(--text-4)", marginBottom: 4 }}>MAINTAINED</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: slrStatus ? "var(--green)" : "var(--red)" }}>₹{(slr.maintained || 0).toLocaleString()} Cr</div>
            </div>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "var(--text-4)", marginBottom: 4 }}>SURPLUS / DEFICIT</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: slrStatus ? "var(--green)" : "var(--red)" }}>
                +₹{(slr.surplus || 0).toLocaleString()} Cr
              </div>
            </div>
          </div>
          {/* SLR Asset Breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
            {[
              { label: "G-Sec", value: slr.gsec || DEMO_CRR_SLR.slr.breakdown.gsec, color: "var(--cyan)" },
              { label: "T-Bills", value: slr.tbills || DEMO_CRR_SLR.slr.breakdown.tbills, color: "var(--blue)" },
              { label: "SDF Balance", value: slr.sdf || DEMO_CRR_SLR.slr.breakdown.sdf, color: "var(--purple)" },
              { label: "Other Approved", value: slr.other || DEMO_CRR_SLR.slr.breakdown.other, color: "var(--teal)" },
            ].map((item) => (
              <div key={item.label} style={{ background: "var(--bg-1)", borderRadius: 6, padding: "8px 10px", borderTop: `2px solid ${item.color}` }}>
                <div style={{ fontSize: 9, color: "var(--text-4)", marginBottom: 2 }}>{item.label}</div>
                <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: item.color }}>₹{item.value?.toLocaleString()} Cr</div>
              </div>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <ComposedChart data={slrHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-1)" />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: "var(--text-4)" }} interval={4} />
              <YAxis tick={{ fontSize: 9, fill: "var(--text-4)" }} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: "var(--bg-1)", border: "1px solid var(--border-2)", fontSize: 11 }} />
              <Area type="monotone" dataKey="maintained" stroke="var(--amber)" fill="var(--amber)" fillOpacity={0.15} name="Maintained" />
              <ReferenceLine y={slr.required || 13500} stroke="var(--red)" strokeDasharray="5 5" label={{ value: "Required", fill: "var(--red)", fontSize: 9, position: "right" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Section 3: Liquidity Ratios */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {/* LCR */}
        <div className="card">
          <SectionTitle
            icon={TrendingUp}
            title="Liquidity Coverage Ratio (LCR)"
            subtitle="HQLA / Net Cash Outflows (30d) — minimum 100%"
            color={(lcr.lcr_pct || lcr.lcrPct || 0) >= 100 ? "var(--green)" : "var(--red)"}
            badge={`${(lcr.lcr_pct || lcr.lcrPct || 0).toFixed(1)}%`}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-4)", marginBottom: 8 }}>HQLA BREAKDOWN</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--text-2)" }}>Level 1 (Cash + G-Sec)</span>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--cyan)" }}>₹{(lcr.hqla_level1 || lcr.hqlaLevel1 || 0).toLocaleString()} Cr</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--text-2)" }}>Level 2 (Corp bonds)</span>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--blue)" }}>₹{(lcr.hqla_level2 || lcr.hqlaLevel2 || 0).toLocaleString()} Cr</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-2)", paddingTop: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-1)" }}>Total HQLA</span>
                  <span className="mono" style={{ fontSize: 15, fontWeight: 700, color: "var(--green)" }}>₹{(lcr.total_hqla || lcr.totalHqla || 0).toLocaleString()} Cr</span>
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-4)", marginBottom: 8 }}>RATIO</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "var(--text-2)" }}>Net Cash Outflows (30d)</span>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>₹{(lcr.net_outflows || lcr.netOutflows || 0).toLocaleString()} Cr</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-2)", paddingTop: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>LCR</span>
                  <span className="mono" style={{ fontSize: 22, fontWeight: 700, color: (lcr.lcr_pct || lcr.lcrPct || 0) >= 100 ? "var(--green)" : "var(--red)" }}>
                    {(lcr.lcr_pct || lcr.lcrPct || 0).toFixed(1)}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="progress-bar" style={{ height: 6 }}>
                  <div className="progress-fill" style={{ width: `${Math.min((lcr.lcr_pct || lcr.lcrPct || 0), 150) / 1.5}%`, background: (lcr.lcr_pct || lcr.lcrPct || 0) >= 100 ? "var(--green)" : "var(--red)" }} />
                </div>
                <div style={{ fontSize: 9, color: "var(--text-4)", textAlign: "right" }}>Min: 100%</div>
              </div>
            </div>
          </div>
        </div>

        {/* NSFR */}
        <div className="card">
          <SectionTitle
            icon={TrendingUp}
            title="Net Stable Funding Ratio (NSFR)"
            subtitle="Available Stable Funding / Required Stable Funding — minimum 100%"
            color={(nsfr.nsfr_pct || nsfr.nsfrPct || 0) >= 100 ? "var(--green)" : "var(--red)"}
            badge={`${(nsfr.nsfr_pct || nsfr.nsfrPct || 0).toFixed(1)}%`}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-4)", marginBottom: 8 }}>FUNDING COMPONENTS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "var(--text-2)" }}>Available Stable Funding</span>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--cyan)" }}>₹{(nsfr.asf || 0).toLocaleString()} Cr</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "var(--text-2)" }}>Required Stable Funding</span>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--amber)" }}>₹{(nsfr.rsf || 0).toLocaleString()} Cr</span>
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--text-4)", marginBottom: 8 }}>RATIO</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>NSFR</span>
                  <span className="mono" style={{ fontSize: 22, fontWeight: 700, color: (nsfr.nsfr_pct || nsfr.nsfrPct || 0) >= 100 ? "var(--green)" : "var(--red)" }}>
                    {(nsfr.nsfr_pct || nsfr.nsfrPct || 0).toFixed(1)}%
                  </span>
                </div>
                <div className="progress-bar" style={{ height: 6 }}>
                  <div className="progress-fill" style={{ width: `${Math.min((nsfr.nsfr_pct || nsfr.nsfrPct || 0), 150) / 1.5}%`, background: (nsfr.nsfr_pct || nsfr.nsfrPct || 0) >= 100 ? "var(--green)" : "var(--red)" }} />
                </div>
                <div style={{ fontSize: 9, color: "var(--text-4)", textAlign: "right" }}>Min: 100%</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Regulatory Reports */}
      <div className="card">
        <SectionTitle
          icon={FileText}
          title="Regulatory Reports"
          subtitle="RBI returns via CIMS — Form A (CRR), Form VIII (SLR), ALM Statement"
          color="var(--blue)"
          badge={`${reports.length} reports`}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 18 }}>
          {REPORT_TYPES.map((rt) => {
            const latest = reports.find((r) => r.report_type === rt.id);
            return (
              <div key={rt.id} style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14, borderLeft: "3px solid var(--blue)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{rt.name}</span>
                  <span className="badge mono" style={{ background: "rgba(59,130,246,0.12)", color: "var(--blue)" }}>{rt.frequency}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-2)", marginBottom: 4 }}>{rt.title}</div>
                <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 10 }}>{rt.description}</div>
                <div style={{ fontSize: 9, color: "var(--text-4)", marginBottom: 4 }}>Submission: {rt.submission}</div>
                {latest && (
                  <div style={{ fontSize: 9, color: "var(--text-3)", marginBottom: 8 }}>
                    Last: {latest.period_start} — <span className="badge mono" style={{ background: latest.status === "submitted" ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)", color: latest.status === "submitted" ? "var(--green)" : "var(--amber)" }}>{latest.status}</span>
                  </div>
                )}
                <button
                  className="btn-primary"
                  style={{ width: "100%", fontSize: 11, padding: "8px 12px" }}
                  onClick={() => handleGenerate(rt.id)}
                  disabled={generating === rt.id}
                >
                  {generating === rt.id ? <><RefreshCw size={12} className="spin" /> Generating...</> : <><FileText size={12} /> Generate {rt.name}</>}
                </button>
              </div>
            );
          })}
        </div>

        {/* Report History Table */}
        {reports.length > 0 && (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", marginBottom: 8 }}>Report History</div>
            <div className="scrollbar-thin" style={{ maxHeight: 180, overflowY: "auto" }}>
              {reports.map((r) => (
                <div key={r.id} style={{ display: "grid", gridTemplateColumns: "0.8fr 1.5fr 1fr 1fr 0.6fr", padding: "8px 0", borderBottom: "1px solid var(--border-1)", alignItems: "center" }}>
                  <span className="badge mono" style={{ background: "rgba(59,130,246,0.12)", color: "var(--blue)", justifySelf: "start" }}>
                    {r.report_type === "form_a" ? "Form A" : r.report_type === "form_viii" ? "Form VIII" : "ALM"}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-2)" }}>{r.period_start} — {r.period_end}</span>
                  <span style={{ fontSize: 10, color: "var(--text-3)" }}>{r.generated_at?.split("T")[0]}</span>
                  <span className="badge mono" style={{
                    background: r.status === "submitted" ? "rgba(16,185,129,0.12)" : r.status === "archived" ? "rgba(100,116,139,0.12)" : "rgba(245,158,11,0.12)",
                    color: r.status === "submitted" ? "var(--green)" : r.status === "archived" ? "var(--text-3)" : "var(--amber)",
                    justifySelf: "start",
                  }}>{r.status}</span>
                  <button className="btn-ghost" style={{ fontSize: 9, padding: "4px 8px" }} onClick={() => window.open(`/api/regulatory/reports/${r.id}/export`, "_blank")}>
                    <Download size={10} /> JSON
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
