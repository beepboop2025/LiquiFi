import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Brain,
  Building,
  Clock,
  Layers,
  Radio,
  Settings,
  Shield,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { ALERTS_FULL } from "../../constants/alerts";
import { BANK_ACCOUNTS } from "../../constants/counterparties";
import { DEPLOYMENT_PORTFOLIO } from "../../constants/instruments";
import { resolveIcon } from "../../constants/iconMap";
import SectionTitle from "../shared/SectionTitle";
import StatBox from "../shared/StatBox";
import StatusBadge from "../shared/StatusBadge";
import Tt from "../shared/Tt";

import type {
  RatesSnapshot,
  ForecastPoint,
  HistoricalRatePoint,
  CashFlowPoint,
  PaymentStream,
} from "../../types";

interface TabCommandCenterProps {
  rates: RatesSnapshot;
  clockData: ForecastPoint[];
  historicalRates: HistoricalRatePoint[];
  cashFlowHistory: CashFlowPoint[];
  paymentStreams: PaymentStream[];
}

export default function TabCommandCenter({ clockData, historicalRates, paymentStreams }: TabCommandCenterProps) {
  const yieldToday: Record<string, number> = { call: 8.2, cblo: 3.1, repo: 2.4, mmf: 1.0, tbill: 0.5, notice: 0.3 };
  const total = Object.values(yieldToday).reduce((a, b) => a + b, 0);
  const totalDeployed = DEPLOYMENT_PORTFOLIO.reduce((a, b) => a + b.amount, 0);
  const totalBalance = BANK_ACCOUNTS.reduce((a, b) => a + b.balance, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <StatBox label="Total Cash Position" value={`₹${(totalBalance + totalDeployed).toFixed(0)}Cr`} sub="Across 6 bank accounts" color="var(--cyan)" icon={Wallet} />
        <StatBox label="Deployed Capital" value={`₹${totalDeployed}Cr`} sub={`${((totalDeployed / (totalBalance + totalDeployed)) * 100).toFixed(1)}% utilization`} color="var(--purple)" icon={Layers} />
        <StatBox label="Current Account" value={`₹${totalBalance.toFixed(1)}Cr`} sub="Available for instant payments" color="var(--blue)" icon={Building} />
        <StatBox label="Today's Yield" value={`₹${total.toFixed(1)}L`} sub="+158bps vs FD benchmark" color="var(--green)" icon={TrendingUp} />
        <StatBox label="Liquidity at Risk" value="₹18.5Cr" sub="99% VaR (1-day horizon)" color="var(--amber)" icon={Shield} />
        <StatBox label="Prediction Accuracy" value="96.2%" sub="MAPE: 3.8% (7-day avg)" color="var(--teal)" icon={Brain} />
      </div>

      <div className="card card-glow">
        <SectionTitle
          icon={Clock}
          title="Liquidity Clock — 24h Forecast"
          subtitle="LSTM model prediction with 95%/99% confidence intervals • Retrained at 06:00 IST today"
          badge="LIVE"
          right={
            <div style={{ display: "flex", gap: 14, fontSize: 10, color: "var(--text-3)", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 2, background: "var(--cyan)", borderRadius: 1, display: "inline-block" }} /> Actual</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 2, background: "var(--purple)", borderRadius: 1, display: "inline-block", opacity: 0.7 }} /> Predicted</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 3, background: "rgba(167,139,250,0.15)", borderRadius: 1, display: "inline-block" }} /> 95% CI</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 2, background: "var(--red)", borderRadius: 1, display: "inline-block", opacity: 0.5 }} /> Min Buffer</span>
            </div>
          }
        />
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={clockData}>
            <defs>
              <linearGradient id="gCyan" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#06d6e0" stopOpacity={0.2} /><stop offset="100%" stopColor="#06d6e0" stopOpacity={0} /></linearGradient>
              <linearGradient id="gCI" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" stopOpacity={0.12} /><stop offset="100%" stopColor="#a78bfa" stopOpacity={0.02} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" stroke="rgba(30,37,64,0.8)" />
            <XAxis dataKey="hour" tick={{ fill: "#475569", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={{ stroke: "#1a2540" }} tickLine={false} interval={1} />
            <YAxis tick={{ fill: "#475569", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}Cr`} domain={["auto", "auto"]} />
            <Tooltip content={<Tt />} />
            <Area type="monotone" dataKey="ci95_upper" stroke="none" fill="url(#gCI)" name="CI95 Upper" />
            <Area type="monotone" dataKey="ci95_lower" stroke="none" fill="var(--bg-2)" name="CI95 Lower" />
            <Area type="monotone" dataKey="balance" stroke="#06d6e0" strokeWidth={2} fill="url(#gCyan)" name="₹ Actual" />
            <Line type="monotone" dataKey="predicted" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="5 3" dot={false} name="₹ Predicted" />
            <Line type="monotone" dataKey="min_buffer" stroke="#ef4444" strokeWidth={1} strokeDasharray="4 4" dot={false} name="₹ Min Buffer" />
            <ReferenceLine y={120} stroke="#ef444466" strokeDasharray="8 4" label={{ value: "Min Buffer ₹120Cr", fill: "#ef4444", fontSize: 9, fontFamily: "JetBrains Mono" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
        <div className="card">
          <SectionTitle icon={BarChart3} title="Cash Position Waterfall" subtitle="Real-time position across all pools" color="var(--green)" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Current Account (Idle)", value: totalBalance.toFixed(1), pct: 100, color: "var(--cyan)" },
              ...DEPLOYMENT_PORTFOLIO.map((d) => ({ label: `${d.instrument}`, value: d.amount.toFixed(0), pct: d.amount / totalDeployed * 90 + 10, color: d.color })),
              { label: "Incoming (T+0/T+1)", value: "57.3", pct: 8, color: "var(--blue)" },
            ].map((item, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: "var(--text-2)" }}>{item.label}</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--text-0)", fontWeight: 500 }}>₹{item.value}Cr</span>
                </div>
                <div className="progress-bar"><div className="progress-fill" style={{ width: `${item.pct}%`, background: item.color }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <SectionTitle icon={TrendingUp} title="Yield Attribution" subtitle="Today's earnings by instrument" color="var(--amber)" />
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <ResponsiveContainer width={120} height={120}>
              <PieChart>
                <Pie data={DEPLOYMENT_PORTFOLIO.slice(0, 6)} dataKey="pct" cx="50%" cy="50%" innerRadius={36} outerRadius={56} paddingAngle={2} strokeWidth={0}>
                  {DEPLOYMENT_PORTFOLIO.slice(0, 6).map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
              {Object.entries(yieldToday).map(([key, val], i) => {
                const names: Record<string, string> = { call: "Call Money", cblo: "CBLO", repo: "Repo", mmf: "Liquid MMF", tbill: "T-Bills", notice: "Notice Money" };
                const colors: Record<string, string> = { call: "#a78bfa", cblo: "#06d6e0", repo: "#10b981", mmf: "#f59e0b", tbill: "#ef4444", notice: "#fb923c" };
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 6, height: 6, borderRadius: 2, background: colors[key], flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "var(--text-2)", flex: 1 }}>{names[key]}</span>
                    <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: "var(--text-0)" }}>₹{val}L</span>
                  </div>
                );
              })}
              <div style={{ borderTop: "1px solid var(--border-1)", paddingTop: 6, marginTop: 2, display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Total</span>
                <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: "var(--green)" }}>₹{total.toFixed(1)}L</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <SectionTitle icon={Bell} title="Active Alerts" color="var(--red)" badge={`${ALERTS_FULL.length}`} right={<button className="btn-ghost"><Settings size={12} /> Config</button>} />
          <div className="scrollbar-thin" style={{ maxHeight: 280, overflowY: "auto" }}>
            {ALERTS_FULL.slice(0, 8).map((a, i) => {
              const Icon = resolveIcon(a.icon) || AlertTriangle;
              return (
                <div key={i} className="anim-in" style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border-1)", animationDelay: `${i * 50}ms` }}>
                  <div style={{ background: `${a.color}14`, borderRadius: 6, padding: 5, flexShrink: 0, marginTop: 1 }}>
                    <Icon size={12} color={a.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, color: "var(--text-1)", lineHeight: 1.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.msg}</p>
                    <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
                      <span className="badge mono" style={{ background: "var(--bg-1)", color: "var(--text-3)" }}>{a.module}</span>
                      <span style={{ fontSize: 10, color: "var(--text-4)" }}>{a.time}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div className="card">
          <SectionTitle icon={Activity} title="90-Day Rate History" subtitle="MIBOR vs CBLO vs Repo — basis point spread analysis" color="var(--purple)" />
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={historicalRates}>
              <CartesianGrid strokeDasharray="3 6" stroke="rgba(30,37,64,0.5)" />
              <XAxis dataKey="day" tick={false} axisLine={{ stroke: "#1a2540" }} />
              <YAxis yAxisId="left" tick={{ fill: "#475569", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={(v: number) => `${v}%`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: "#475569", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}bps`} />
              <Tooltip content={<Tt />} />
              <Line yAxisId="left" type="monotone" dataKey="mibor" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="MIBOR" />
              <Line yAxisId="left" type="monotone" dataKey="cblo" stroke="#06d6e0" strokeWidth={1.5} dot={false} name="CBLO" />
              <Line yAxisId="left" type="monotone" dataKey="repo" stroke="#10b981" strokeWidth={1.5} dot={false} name="Repo" />
              <Bar yAxisId="right" dataKey="spread" fill="rgba(245,158,11,0.15)" radius={[2, 2, 0, 0]} name="MIBOR-Repo Spread (bps)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <SectionTitle icon={Building} title="Bank Account Positions" subtitle="Real-time balances across all linked accounts" color="var(--blue)" />
          <div>
            <div className="table-header" style={{ display: "grid", gridTemplateColumns: "2fr 1.5fr 1.5fr 1fr 1fr" }}>
              <span>Bank</span><span>Account</span><span>Balance</span><span>RTGS</span><span>NEFT</span>
            </div>
            {BANK_ACCOUNTS.map((acc, i) => (
              <div key={i} className="table-row" style={{ gridTemplateColumns: "2fr 1.5fr 1.5fr 1fr 1fr" }}>
                <span style={{ fontWeight: 500, color: "var(--text-1)" }}>{acc.bank}</span>
                <span className="mono" style={{ color: "var(--text-3)", fontSize: 11 }}>{acc.account}</span>
                <span className="mono" style={{ fontWeight: 600, color: "var(--cyan)" }}>₹{acc.balance}Cr</span>
                <span><span className="status-dot live" style={{ display: "inline-block" }} /></span>
                <span><span className="status-dot live" style={{ display: "inline-block" }} /></span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <SectionTitle icon={Radio} title="Live Payment Streams" subtitle="ISO 20022 message ingestion — RTGS, NEFT, UPI, IMPS" color="var(--teal)" badge={`${paymentStreams.length} txns`} />
        <div className="scrollbar-thin" style={{ maxHeight: 260, overflowY: "auto" }}>
          <div className="table-header" style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 0.8fr 1.2fr 2fr 1fr 1fr 1fr", position: "sticky", top: 0, background: "var(--bg-2)", zIndex: 1 }}>
            <span>ID</span><span>Type</span><span>Dir</span><span>Amount</span><span>Counterparty</span><span>Bank</span><span>ISO Ref</span><span>Status</span>
          </div>
          {paymentStreams.map((tx, i) => (
            <div key={i} className="table-row" style={{ gridTemplateColumns: "1fr 0.8fr 0.8fr 1.2fr 2fr 1fr 1fr 1fr" }}>
              <span className="mono" style={{ color: "var(--text-3)", fontSize: 10 }}>{tx.id}</span>
              <span className="badge mono" style={{ background: "var(--bg-1)", color: "var(--text-2)", justifySelf: "start" }}>{tx.type}</span>
              <span style={{ color: tx.direction === "credit" ? "var(--green)" : "var(--red)", display: "flex", alignItems: "center", gap: 3 }}>
                {tx.direction === "credit" ? <ArrowDownRight size={11} /> : <ArrowUpRight size={11} />}
                {tx.direction}
              </span>
              <span className="mono" style={{ fontWeight: 600, color: tx.direction === "credit" ? "var(--green)" : "var(--text-1)" }}>₹{tx.amount.toFixed(1)}Cr</span>
              <span style={{ color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.counterparty}</span>
              <span style={{ color: "var(--text-3)" }}>{tx.bank}</span>
              <span className="mono" style={{ color: "var(--text-4)", fontSize: 9 }}>{tx.iso20022}</span>
              <StatusBadge status={tx.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
