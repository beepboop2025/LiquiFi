import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle,
  Clock,
  Download,
  GitBranch,
  Layers,
  Play,
  RefreshCw,
  Shield,
  ShieldCheck,
  Zap,
} from "lucide-react";

import { COUNTERPARTIES } from "../../constants/counterparties";
import { resolveCounterparty, validateDeploymentPlan } from "../../engine/validation";
import SectionTitle from "../shared/SectionTitle";
import StatBox from "../shared/StatBox";
import StatusBadge from "../shared/StatusBadge";

import type {
  RatesSnapshot,
  AppBackendState,
  Counterparty,
  ValidationResult,
} from "../../types";

interface DeploymentSplit {
  cp: string;
  amt: number;
}

interface SuggestedAllocation {
  instrument: string;
  amount: number;
  rate: number;
  platform: string;
  reason: string;
  splits: DeploymentSplit[];
}

interface DeploymentResult {
  ok: boolean;
  message: string;
}

interface TabExecutionProps {
  rates: RatesSnapshot;
  backend: AppBackendState;
  onExecuteDeployment: (payload: { plan: SuggestedAllocation[]; surplus: number }) => Promise<DeploymentResult>;
  onExportOrderBook: () => void;
  onRefreshTelemetry: () => void;
}

export default function TabExecution({ rates, backend, onExecuteDeployment, onExportOrderBook, onRefreshTelemetry }: TabExecutionProps) {
  const [deploying, setDeploying] = useState<boolean>(false);
  const [deployed, setDeployed] = useState<boolean>(false);
  const [splitView, setSplitView] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const surplus = 50;

  const suggestedAlloc = useMemo<SuggestedAllocation[]>(() => ([
    { instrument: "CBLO", amount: 20, rate: rates.cblo_bid, platform: "CCIL", reason: "Highest risk-adjusted score, T+0, G-Sec collateral", splits: [{ cp: "SBI", amt: 10 }, { cp: "ICICI", amt: 10 }] },
    { instrument: "Call Money", amount: 15, rate: rates.mibor_overnight, platform: "NDS-Call", reason: "Best yield, strong liquidity depth", splits: [{ cp: "ICICI", amt: 8 }, { cp: "Axis", amt: 7 }] },
    { instrument: "O/N Repo", amount: 10, rate: rates.repo, platform: "NDS-OM", reason: "Sovereign collateralized deployment", splits: [{ cp: "CCIL Triparty", amt: 10 }] },
    { instrument: "Liquid MMF", amount: 5, rate: rates.mmf_liquid, platform: "CAMS", reason: "Instant redemption for intraday buffers", splits: [{ cp: "HDFC Liquid", amt: 3 }, { cp: "SBI Liquid", amt: 2 }] },
  ]), [rates.cblo_bid, rates.mibor_overnight, rates.repo, rates.mmf_liquid]);

  const preTradeCheck = useMemo<ValidationResult>(
    () => validateDeploymentPlan(suggestedAlloc, surplus, backend.killSwitch),
    [suggestedAlloc, surplus, backend.killSwitch]
  );

  const projectedLoads = useMemo<Record<string, number>>(() => {
    const totals: Record<string, number> = {};
    suggestedAlloc.forEach((leg) => {
      leg.splits.forEach((split) => {
        const cp: Counterparty | null = resolveCounterparty(split.cp);
        if (!cp) return;
        totals[cp.name] = (totals[cp.name] || 0) + split.amt;
      });
    });
    return totals;
  }, [suggestedAlloc]);

  const handleDeploy = useCallback(async () => {
    if (deploying) return;
    setDeploying(true);
    setDeployed(false);
    setMessage("");
    const result = await onExecuteDeployment({ plan: suggestedAlloc, surplus });
    setDeploying(false);
    setDeployed(result.ok);
    setMessage(result.message);
  }, [deploying, onExecuteDeployment, suggestedAlloc]);

  const canDeploy = !deploying && !backend.circuitOpen && preTradeCheck.errors.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="card card-glow" style={{ borderColor: deployed ? "rgba(16,185,129,0.3)" : backend.circuitOpen ? "rgba(239,68,68,0.3)" : "var(--border-1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
              <Zap size={20} color="var(--cyan)" /> Smart Deployment Engine
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>
              Pre-trade risk checks + idempotency + retry/circuit breaker for ₹{surplus}Cr surplus deployment
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn-ghost" onClick={() => setSplitView(!splitView)}>
              <GitBranch size={12} /> {splitView ? "Hide" : "Show"} Splits
            </button>
            <button className="btn-ghost" onClick={onRefreshTelemetry}>
              <RefreshCw size={12} /> Refresh Telemetry
            </button>
            <button className="btn-primary" onClick={handleDeploy} disabled={!canDeploy}>
              {deploying ? <><RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> Executing Orders...</> : <><Play size={16} /> Deploy ₹{surplus}Cr</>}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
          <StatBox label="Queue Depth" value={`${backend.queueDepth}`} sub="Pending messages" color={backend.queueDepth > 20 ? "var(--amber)" : "var(--cyan)"} icon={Layers} small />
          <StatBox label="Success Rate 24h" value={`${backend.successRate.toFixed(2)}%`} sub={`${backend.failedTx24h} failed / ${backend.processedTx24h} processed`} color={backend.successRate > 99 ? "var(--green)" : "var(--amber)"} icon={Shield} small />
          <StatBox label="P99 Latency" value={`${backend.apiLatencyP99.toFixed(0)}ms`} sub={backend.failoverMode === "auto" ? "Failover: AUTO" : "Failover: MANUAL"} color={backend.apiLatencyP99 < 40 ? "var(--green)" : "var(--amber)"} icon={Clock} small />
          <StatBox label="Execution Guard" value={backend.circuitOpen ? "Circuit OPEN" : "Circuit CLOSED"} sub={backend.killSwitch ? "Kill switch ON" : "Kill switch OFF"} color={backend.circuitOpen || backend.killSwitch ? "var(--red)" : "var(--green)"} icon={backend.circuitOpen ? AlertTriangle : ShieldCheck} small />
        </div>

        {message && (
          <div style={{ background: deployed ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.08)", border: `1px solid ${deployed ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.2)"}`, borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 11, color: deployed ? "var(--green)" : "var(--red)" }}>
            {message}
          </div>
        )}

        <div style={{ background: "var(--bg-1)", border: "1px solid var(--border-1)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 10, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Pre-Trade Validation</span>
            <StatusBadge status={preTradeCheck.valid ? "pass" : "fail"} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--green)", marginBottom: 4 }}>Checks Passed</div>
              <div style={{ fontSize: 11, color: "var(--text-2)" }}>Plan total: ₹{preTradeCheck.total.toFixed(1)}Cr / ₹{surplus}Cr</div>
              <div style={{ fontSize: 11, color: backend.circuitOpen ? "var(--red)" : "var(--text-2)" }}>Circuit: {backend.circuitOpen ? "Open" : "Closed"}</div>
            </div>
            <div>
              {preTradeCheck.errors.length > 0 && preTradeCheck.errors.map((err, i) => (
                <div key={`e-${i}`} style={{ fontSize: 10, color: "var(--red)", lineHeight: 1.5 }}>• {err}</div>
              ))}
              {preTradeCheck.errors.length === 0 && preTradeCheck.warnings.length > 0 && preTradeCheck.warnings.map((warn, i) => (
                <div key={`w-${i}`} style={{ fontSize: 10, color: "var(--amber)", lineHeight: 1.5 }}>• {warn}</div>
              ))}
              {preTradeCheck.errors.length === 0 && preTradeCheck.warnings.length === 0 && (
                <div style={{ fontSize: 10, color: "var(--green)" }}>All hard checks passed: limits, split integrity, idempotency gate ready.</div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {suggestedAlloc.map((item, i) => (
            <div key={i} style={{ background: deployed ? "rgba(6,214,224,0.03)" : "var(--bg-1)", borderRadius: 8, padding: 14, border: `1px solid ${deployed ? "rgba(16,185,129,0.2)" : "var(--border-1)"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{item.instrument}</span>
                <span className="badge mono" style={{ background: "var(--bg-3)", color: "var(--text-2)" }}>{item.platform}</span>
              </div>
              <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: "var(--cyan)" }}>₹{item.amount}Cr</div>
              <div className="mono" style={{ fontSize: 12, color: "var(--green)", marginTop: 4 }}>{item.rate.toFixed(2)}%</div>
              <p style={{ fontSize: 10, color: "var(--text-3)", lineHeight: 1.5, marginTop: 6 }}>{item.reason}</p>
              {splitView && (
                <div style={{ marginTop: 8, borderTop: "1px solid var(--border-1)", paddingTop: 8 }}>
                  <div style={{ fontSize: 9, color: "var(--text-4)", marginBottom: 4, textTransform: "uppercase" }}>Order Splits</div>
                  {item.splits.map((s, j) => (
                    <div key={j} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-2)", padding: "2px 0" }}>
                      <span>{s.cp}</span>
                      <span className="mono">₹{s.amt}Cr</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <SectionTitle icon={BookOpen} title="Order Book" subtitle="Execution output from backend queue with retry/circuit controls" color="var(--blue)" badge={`${backend.orderBook.length} orders`} right={
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" onClick={onExportOrderBook}><Download size={12} /> Export</button>
            <button className="btn-ghost" onClick={onRefreshTelemetry}><RefreshCw size={12} /> Refresh</button>
          </div>
        } />
        <div className="scrollbar-thin" style={{ maxHeight: 340, overflowY: "auto" }}>
          <div className="table-header" style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 1.2fr 0.7fr 1fr 0.8fr 1.2fr 1fr 0.8fr", position: "sticky", top: 0, background: "var(--bg-2)", zIndex: 1 }}>
            <span>Order ID</span><span>Time</span><span>Instrument</span><span>Side</span><span>Amount</span><span>Rate</span><span>Counterparty</span><span>Platform</span><span>Status</span>
          </div>
          {backend.orderBook.map((ord) => (
            <div key={ord.id} className="table-row" style={{ gridTemplateColumns: "1fr 0.8fr 1.2fr 0.7fr 1fr 0.8fr 1.2fr 1fr 0.8fr" }}>
              <span className="mono" style={{ color: "var(--text-3)", fontSize: 10 }}>{ord.id}</span>
              <span className="mono" style={{ color: "var(--text-4)", fontSize: 10 }}>{ord.time}</span>
              <span style={{ fontWeight: 500 }}>{ord.instrument}</span>
              <span className="mono" style={{ color: ord.side === "LEND" ? "var(--green)" : "var(--red)", fontWeight: 600, fontSize: 10 }}>{ord.side}</span>
              <span className="mono" style={{ fontWeight: 600 }}>₹{ord.amount}Cr</span>
              <span className="mono" style={{ color: "var(--green)" }}>{ord.rate.toFixed(2)}%</span>
              <span style={{ color: "var(--text-2)", fontSize: 11 }}>{ord.counterparty}</span>
              <span className="badge mono" style={{ background: "var(--bg-1)", color: "var(--text-3)", justifySelf: "start" }}>{ord.platform}</span>
              <StatusBadge status={ord.status} />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <SectionTitle icon={Shield} title="Counterparty Directory" subtitle="Projected utilization includes this deployment plan" color="var(--purple)" />
        <div className="table-header" style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.6fr 0.9fr 1.3fr 1.1fr 0.8fr 0.9fr 0.6fr" }}>
          <span>Bank</span><span>Rating</span><span>Agency</span><span>Current</span><span>Projected</span><span>Utilization</span><span>Sector</span><span>Reliability</span><span>Watch</span>
        </div>
        {COUNTERPARTIES.map((cp) => {
          const projected = cp.exposure + (projectedLoads[cp.name] || 0);
          const utilization = projected / cp.limit;
          return (
            <div key={cp.name} className="table-row" style={{ gridTemplateColumns: "1.4fr 0.8fr 0.6fr 0.9fr 1.3fr 1.1fr 0.8fr 0.9fr 0.6fr" }}>
              <span style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                {cp.watchlist && <span className="status-dot warn" />}
                {cp.name}
              </span>
              <span className="mono" style={{ color: cp.rating === "A1+" ? "var(--green)" : cp.rating === "A1" ? "var(--amber)" : "var(--red)", fontWeight: 600 }}>{cp.rating}</span>
              <span style={{ color: "var(--text-4)", fontSize: 10 }}>{cp.agency}</span>
              <span className="mono" style={{ fontWeight: 600 }}>₹{cp.exposure}Cr</span>
              <span className="mono" style={{ color: projected > cp.limit ? "var(--red)" : "var(--cyan)", fontWeight: 600 }}>₹{projected.toFixed(1)}Cr</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="progress-bar" style={{ flex: 1 }}>
                  <div className="progress-fill" style={{ width: `${Math.min(utilization * 100, 100)}%`, background: utilization > 1 ? "var(--red)" : utilization > 0.8 ? "var(--amber)" : "var(--cyan)" }} />
                </div>
                <span className="mono" style={{ fontSize: 10, color: utilization > 1 ? "var(--red)" : utilization > 0.8 ? "var(--amber)" : "var(--text-3)", minWidth: 30 }}>{(utilization * 100).toFixed(0)}%</span>
              </div>
              <span className="badge mono" style={{ background: "var(--bg-1)", color: cp.sector === "PSU" ? "var(--blue)" : "var(--purple)", justifySelf: "start" }}>{cp.sector}</span>
              <span className="mono" style={{ color: cp.reliability > 99 ? "var(--green)" : "var(--amber)" }}>{cp.reliability}%</span>
              <span>{cp.watchlist ? <AlertCircle size={13} color="var(--amber)" /> : <CheckCircle size={13} color="var(--green)" />}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
