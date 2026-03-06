import {
  BarChart3,
  Crosshair,
  Lock,
  PieChart as PieIcon,
  RefreshCw,
  Target,
} from "lucide-react";

import type { RatesSnapshot } from "../../types";
import { DEPLOYMENT_PORTFOLIO } from "../../constants/instruments";
import SectionTitle from "../shared/SectionTitle";
import StatBox from "../shared/StatBox";

interface TabOptimizerProps {
  rates: RatesSnapshot;
}

export default function TabOptimizer({ rates }: TabOptimizerProps) {
  const spread = +((rates.mibor_overnight - rates.repo) * 100).toFixed(1);
  const arbitrageActive = spread > 25;

  const instrumentRanking = [
    { name: "CBLO", yield: rates.cblo_bid, liquidity: 0.98, safety: 0.99, score: 0, settlement: "T+0" },
    { name: "Call Money", yield: rates.mibor_overnight, liquidity: 0.92, safety: 0.95, score: 0, settlement: "T+1" },
    { name: "Overnight Repo", yield: rates.repo, liquidity: 0.95, safety: 0.99, score: 0, settlement: "T+0" },
    { name: "Liquid MMF", yield: rates.mmf_liquid, liquidity: 0.90, safety: 0.97, score: 0, settlement: "T+0" },
    { name: "T-Bill 91D", yield: rates.tbill_91d, liquidity: 0.75, safety: 1.00, score: 0, settlement: "T+1" },
    { name: "Notice Money 7D", yield: rates.notice_7d, liquidity: 0.60, safety: 0.94, score: 0, settlement: "T+1" },
    { name: "CD 3M", yield: rates.cd_3m, liquidity: 0.55, safety: 0.93, score: 0, settlement: "T+1" },
    { name: "CP 1M", yield: rates.cp_1m, liquidity: 0.45, safety: 0.88, score: 0, settlement: "T+1" },
  ].map((i) => ({ ...i, score: +(i.yield * i.liquidity * i.safety).toFixed(3) })).sort((a, b) => b.score - a.score);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <StatBox label="MIBOR-Repo Spread" value={`${spread}bps`} sub={arbitrageActive ? "Arbitrage threshold exceeded" : "Within normal range"} color={arbitrageActive ? "var(--amber)" : "var(--text-2)"} icon={Crosshair} />
        <StatBox label="Objective Function" value="Max Yield" sub="Yield \u00D7 Liquidity \u00D7 Safety" color="var(--purple)" icon={Target} />
        <StatBox label="Active Constraints" value="12" sub="SEBI + RBI + Counterparty limits" color="var(--blue)" icon={Lock} />
        <StatBox label="Last Optimization" value="12s ago" sub="Runs every 30 seconds" color="var(--green)" icon={RefreshCw} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div className="card card-glow">
          <SectionTitle icon={BarChart3} title="AI Instrument Ranking" subtitle="Score = Yield \u00D7 Liquidity_Score \u00D7 Safety_Score" color="var(--cyan)" badge="LIVE" />
          <div>
            <div className="table-header" style={{ display: "grid", gridTemplateColumns: "0.3fr 1.5fr 1fr 1fr 1fr 1fr 1fr" }}>
              <span>#</span><span>Instrument</span><span>Yield</span><span>Liquidity</span><span>Safety</span><span>Score</span><span>Settle</span>
            </div>
            {instrumentRanking.map((inst, i) => (
              <div key={i} className="table-row" style={{ gridTemplateColumns: "0.3fr 1.5fr 1fr 1fr 1fr 1fr 1fr" }}>
                <span className="mono" style={{ fontSize: 11, color: i < 3 ? "var(--cyan)" : "var(--text-3)", fontWeight: 700 }}>{i + 1}</span>
                <span style={{ fontWeight: 500, color: "var(--text-1)" }}>{inst.name}</span>
                <span className="mono" style={{ color: "var(--green)", fontWeight: 600 }}>{inst.yield.toFixed(2)}%</span>
                <span className="mono" style={{ color: inst.liquidity > 0.9 ? "var(--cyan)" : "var(--amber)" }}>{(inst.liquidity * 100).toFixed(0)}%</span>
                <span className="mono" style={{ color: inst.safety > 0.95 ? "var(--green)" : "var(--amber)" }}>{(inst.safety * 100).toFixed(0)}%</span>
                <span className="mono" style={{ fontWeight: 700, color: i === 0 ? "var(--cyan)" : "var(--text-1)" }}>{inst.score}</span>
                <span className="badge mono" style={{ background: "var(--bg-1)", color: inst.settlement === "T+0" ? "var(--green)" : "var(--text-3)", justifySelf: "start" }}>{inst.settlement}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ borderColor: arbitrageActive ? "rgba(245,158,11,0.3)" : "var(--border-1)" }}>
          <SectionTitle icon={Crosshair} title="Arbitrage Detection" subtitle="Monitor basis between unsecured (MIBOR) and secured (Repo) rates" color="var(--amber)" badge={arbitrageActive ? "ACTIVE" : "MONITORING"} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--text-4)", marginBottom: 4 }}>MIBOR (Unsecured)</div>
              <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: "var(--purple)" }}>{rates.mibor_overnight.toFixed(2)}%</div>
            </div>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14, textAlign: "center" }}>
              <div style={{ fontSize: 10, color: "var(--text-4)", marginBottom: 4 }}>Repo (Secured)</div>
              <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: "var(--green)" }}>{rates.repo.toFixed(2)}%</div>
            </div>
          </div>
          <div style={{ background: arbitrageActive ? "rgba(245,158,11,0.06)" : "var(--bg-1)", borderRadius: 8, padding: 16, textAlign: "center", border: `1px solid ${arbitrageActive ? "rgba(245,158,11,0.2)" : "var(--border-1)"}` }}>
            <div style={{ fontSize: 10, color: "var(--text-4)", marginBottom: 4 }}>Current Spread</div>
            <div className="mono" style={{ fontSize: 36, fontWeight: 800, color: arbitrageActive ? "var(--amber)" : "var(--text-2)" }}>{spread}bps</div>
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>Threshold: 25bps {arbitrageActive && "\u2022 EXCEEDED"}</div>
            {arbitrageActive && (
              <div style={{ marginTop: 12, padding: 10, background: "rgba(245,158,11,0.08)", borderRadius: 6 }}>
                <p style={{ fontSize: 12, color: "var(--amber)", fontWeight: 600 }}>Strategy: Borrow in Repo @ {rates.repo.toFixed(2)}% → Lend in Call Money @ {rates.mibor_overnight.toFixed(2)}%</p>
                <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Estimated P&L on \u20B9100Cr: \u20B9{(spread * 100 / 365).toFixed(0)}K/day</p>
              </div>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", marginBottom: 8, textTransform: "uppercase" }}>Active Constraints</div>
            {[
              { rule: "Min current account balance", value: "\u20B950Cr (AI-calculated)", status: "active" },
              { rule: "SEBI MMF: Max 25% non-liquid", value: "Current: 18%", status: "pass" },
              { rule: "Counterparty limit: Max 10%", value: "Max: 9.2% (HDFC)", status: "warn" },
              { rule: "Call Money cap: Max 30%", value: "Current: 25.1%", status: "pass" },
              { rule: "Repo cap: Max 40%", value: "Current: 20.1%", status: "pass" },
            ].map((c, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border-1)" }}>
                <span style={{ fontSize: 11, color: "var(--text-2)" }}>{c.rule}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{c.value}</span>
                  <span className="status-dot" style={{ background: c.status === "pass" ? "var(--green)" : c.status === "warn" ? "var(--amber)" : "var(--cyan)" }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <SectionTitle icon={PieIcon} title="Current Portfolio Allocation" subtitle="Live deployment across all money market instruments" color="var(--purple)" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 10 }}>
          {DEPLOYMENT_PORTFOLIO.map((d, i) => (
            <div key={i} style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12, textAlign: "center", borderTop: `3px solid ${d.color}` }}>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 6, fontWeight: 500 }}>{d.instrument}</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: d.color }}>\u20B9{d.amount}Cr</div>
              <div className="mono" style={{ fontSize: 10, color: "var(--text-4)", marginTop: 2 }}>{d.pct}%</div>
              <div style={{ marginTop: 6, fontSize: 10 }}>
                <span style={{ color: "var(--green)" }}>{d.rate}%</span>
                <span style={{ color: "var(--text-4)" }}> \u2022 {d.maturity}</span>
              </div>
              <div style={{ fontSize: 9, color: "var(--text-4)", marginTop: 2 }}>{d.settlement} \u2022 {d.risk}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
