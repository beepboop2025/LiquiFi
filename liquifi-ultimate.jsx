import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, ScatterChart, Scatter, ComposedChart,
  CartesianGrid, ReferenceLine, RadialBarChart, RadialBar
} from "recharts";
import {
  AlertTriangle, TrendingUp, Shield, Zap, Clock, ArrowUpRight, ArrowDownRight,
  ChevronRight, Activity, Eye, BarChart3, Wallet, Layers, Bell, Settings,
  Search, RefreshCw, Play, Lock, Unlock, Target, CheckCircle, XCircle,
  AlertCircle, DollarSign, Brain, Cpu, GitBranch, Database, Globe, FileText,
  Users, Key, Download, Upload, Sliders, PieChart as PieIcon, Crosshair,
  Radio, Wifi, Server, HardDrive, TrendingDown, ArrowRight, RotateCcw,
  Maximize2, Minimize2, ChevronDown, ChevronUp, Hash, Percent, Calendar,
  BookOpen, Briefcase, Building, CreditCard, Landmark, Scale, ShieldCheck,
  Timer, Gauge, Flame, Snowflake, Radar, Compass, Navigation, Map
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════
   SECTION 1: DATA ENGINE — Mock Generators & Constants
   ═══════════════════════════════════════════════════════════ */

const MIBOR_BASE = 6.75;
const REPO_BASE = 6.50;
const MONTE_CARLO_PATHS = 300;
const rand = (min, max) => +(min + Math.random() * (max - min)).toFixed(4);
const randInt = (min, max) => Math.floor(min + Math.random() * (max - min));
const formatCr = (v) => `₹${v.toFixed(1)}Cr`;
const formatL = (v) => `₹${v.toFixed(1)}L`;
const formatPct = (v) => `${v.toFixed(2)}%`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const generateRates = (prev) => {
  const drift = (base, prev_val, vol) => {
    if (!prev_val) return base;
    return +(prev_val + (Math.random() - 0.5) * vol).toFixed(4);
  };
  return {
    mibor_overnight: drift(MIBOR_BASE, prev?.mibor_overnight || MIBOR_BASE, 0.08),
    mibor_14d: drift(MIBOR_BASE + 0.15, prev?.mibor_14d || MIBOR_BASE + 0.15, 0.05),
    mibor_1m: drift(MIBOR_BASE + 0.25, prev?.mibor_1m || MIBOR_BASE + 0.25, 0.04),
    mibor_3m: drift(MIBOR_BASE + 0.45, prev?.mibor_3m || MIBOR_BASE + 0.45, 0.03),
    cblo_bid: drift(6.55, prev?.cblo_bid || 6.55, 0.06),
    cblo_ask: drift(6.62, prev?.cblo_ask || 6.62, 0.06),
    repo: drift(REPO_BASE, prev?.repo || REPO_BASE, 0.03),
    reverse_repo: drift(6.25, prev?.reverse_repo || 6.25, 0.02),
    cd_1m: drift(6.95, prev?.cd_1m || 6.95, 0.04),
    cd_3m: drift(7.10, prev?.cd_3m || 7.10, 0.03),
    cd_6m: drift(7.25, prev?.cd_6m || 7.25, 0.02),
    cd_12m: drift(7.45, prev?.cd_12m || 7.45, 0.02),
    cp_1m: drift(7.20, prev?.cp_1m || 7.20, 0.05),
    cp_3m: drift(7.35, prev?.cp_3m || 7.35, 0.04),
    tbill_91d: drift(6.85, prev?.tbill_91d || 6.85, 0.03),
    tbill_182d: drift(6.95, prev?.tbill_182d || 6.95, 0.02),
    tbill_364d: drift(7.05, prev?.tbill_364d || 7.05, 0.02),
    mifor_1m: drift(7.25, prev?.mifor_1m || 7.25, 0.06),
    mifor_3m: drift(7.45, prev?.mifor_3m || 7.45, 0.05),
    mifor_6m: drift(7.60, prev?.mifor_6m || 7.60, 0.04),
    sofr: drift(5.33, prev?.sofr || 5.33, 0.02),
    usdinr_spot: drift(83.25, prev?.usdinr_spot || 83.25, 0.15),
    usdinr_1m_fwd: drift(83.48, prev?.usdinr_1m_fwd || 83.48, 0.12),
    ois_1y: drift(6.65, prev?.ois_1y || 6.65, 0.03),
    ois_3y: drift(6.80, prev?.ois_3y || 6.80, 0.02),
    ois_5y: drift(6.90, prev?.ois_5y || 6.90, 0.02),
    gsec_10y: drift(7.15, prev?.gsec_10y || 7.15, 0.02),
    call_money_high: drift(6.90, prev?.call_money_high || 6.90, 0.10),
    call_money_low: drift(6.50, prev?.call_money_low || 6.50, 0.08),
    notice_7d: drift(6.80, prev?.notice_7d || 6.80, 0.04),
    notice_14d: drift(6.85, prev?.notice_14d || 6.85, 0.03),
    mmf_liquid: drift(7.05, prev?.mmf_liquid || 7.05, 0.02),
    mmf_overnight: drift(6.45, prev?.mmf_overnight || 6.45, 0.02),
    mmf_ultra_short: drift(7.15, prev?.mmf_ultra_short || 7.15, 0.02),
  };
};

const generateHourlyForecast = () => {
  const data = [];
  let bal = 245 + Math.random() * 30;
  let predicted = bal;
  for (let i = 0; i < 24; i++) {
    const hour = `${String(i).padStart(2, "0")}:00`;
    const isBusinessHour = i >= 9 && i <= 17;
    const inflow = rand(2, isBusinessHour ? 45 : 8);
    const outflow = rand(3, isBusinessHour ? 40 : 5);
    bal = clamp(bal + inflow - outflow, 60, 400);
    predicted = clamp(predicted + inflow - outflow + rand(-15, 15), 50, 420);
    const ci95_upper = predicted + rand(10, 25);
    const ci95_lower = predicted - rand(10, 25);
    const ci99_upper = predicted + rand(20, 40);
    const ci99_lower = Math.max(30, predicted - rand(20, 40));
    data.push({ hour, balance: +bal.toFixed(1), predicted: +predicted.toFixed(1), ci95_upper: +ci95_upper.toFixed(1), ci95_lower: +ci95_lower.toFixed(1), ci99_upper: +ci99_upper.toFixed(1), ci99_lower: +ci99_lower.toFixed(1), min_buffer: 120, inflow: +inflow.toFixed(1), outflow: +outflow.toFixed(1) });
  }
  return data;
};

const generateMonteCarloSims = () => {
  const paths = [];
  for (let p = 0; p < MONTE_CARLO_PATHS; p++) {
    let val = 245 + rand(-20, 20);
    const path = [];
    for (let t = 0; t < 24; t++) {
      val += rand(-18, 18);
      val = Math.max(20, val);
      path.push({ hour: t, value: +val.toFixed(1), pathId: p });
    }
    paths.push(path);
  }
  return paths;
};

const generateHistoricalRates = (days = 90) => {
  const data = [];
  let mibor = MIBOR_BASE;
  let cblo = 6.55;
  let repo = REPO_BASE;
  for (let i = 0; i < days; i++) {
    mibor = clamp(mibor + rand(-0.05, 0.05), 6.2, 7.3);
    cblo = clamp(cblo + rand(-0.04, 0.04), 6.1, 7.0);
    repo = clamp(repo + rand(-0.03, 0.03), 6.1, 6.9);
    data.push({
      day: `D-${days - i}`,
      dayNum: i,
      mibor: +mibor.toFixed(2),
      cblo: +cblo.toFixed(2),
      repo: +repo.toFixed(2),
      spread: +((mibor - repo) * 100).toFixed(1),
    });
  }
  return data;
};

const generateCashFlowHistory = (days = 90) => {
  const data = [];
  for (let i = 0; i < days; i++) {
    const isPayroll = i % 30 === 0;
    const isGST = i % 30 === 20;
    const isAdvTax = [14, 44, 74].includes(i);
    data.push({
      day: i,
      label: `D-${days - i}`,
      inflow: rand(15, 60) + (isPayroll ? 0 : rand(0, 20)),
      outflow: rand(10, 45) + (isPayroll ? 80 : 0) + (isGST ? 40 : 0) + (isAdvTax ? 60 : 0),
      net: 0,
      payroll: isPayroll,
      gst: isGST,
      advtax: isAdvTax,
    });
    data[data.length - 1].net = +(data[data.length - 1].inflow - data[data.length - 1].outflow).toFixed(1);
  }
  return data;
};

const PAYMENT_STREAMS = Array.from({ length: 20 }, (_, i) => ({
  id: `TXN${String(1000 + i).padStart(6, "0")}`,
  type: ["RTGS", "NEFT", "UPI", "IMPS"][randInt(0, 4)],
  direction: Math.random() > 0.45 ? "credit" : "debit",
  amount: rand(0.5, 85),
  counterparty: ["Reliance Industries", "TCS", "Infosys", "HDFC Ltd", "L&T", "Bajaj Finance", "Maruti Suzuki", "ITC Ltd", "ONGC", "SBI"][randInt(0, 10)],
  status: ["settled", "pending", "processing", "settled", "settled"][randInt(0, 5)],
  time: `${String(randInt(9, 18)).padStart(2, "0")}:${String(randInt(0, 59)).padStart(2, "0")}`,
  iso20022: `pacs.008.${String(randInt(100, 999))}`,
  bank: ["SBI", "HDFC", "ICICI", "Axis", "Kotak", "Yes Bank"][randInt(0, 6)],
}));

const BANK_ACCOUNTS = [
  { bank: "SBI", account: "XXXXXXX1234", balance: 82.5, type: "Current", rtgs: true, neft: true },
  { bank: "HDFC Bank", account: "XXXXXXX5678", balance: 64.3, type: "Current", rtgs: true, neft: true },
  { bank: "ICICI Bank", account: "XXXXXXX9012", balance: 38.7, type: "Current", rtgs: true, neft: true },
  { bank: "Axis Bank", account: "XXXXXXX3456", balance: 27.1, type: "Current", rtgs: true, neft: true },
  { bank: "Kotak", account: "XXXXXXX7890", balance: 18.9, type: "Current", rtgs: true, neft: true },
  { bank: "Yes Bank", account: "XXXXXXX2345", balance: 13.5, type: "CC/OD", rtgs: true, neft: true },
];

const COUNTERPARTIES = [
  { name: "SBI", rating: "A1+", agency: "CRISIL", exposure: 85, limit: 100, pctLimit: 10, reliability: 99.8, sector: "PSU", lastSettlement: "On-time", watchlist: false },
  { name: "HDFC Bank", rating: "A1+", agency: "ICRA", exposure: 92, limit: 100, pctLimit: 10, reliability: 99.5, sector: "Private", lastSettlement: "On-time", watchlist: true },
  { name: "ICICI Bank", rating: "A1+", agency: "CRISIL", exposure: 68, limit: 100, pctLimit: 10, reliability: 99.7, sector: "Private", lastSettlement: "On-time", watchlist: false },
  { name: "Axis Bank", rating: "A1+", agency: "CARE", exposure: 45, limit: 100, pctLimit: 10, reliability: 98.9, sector: "Private", lastSettlement: "On-time", watchlist: false },
  { name: "Kotak Mahindra", rating: "A1", agency: "ICRA", exposure: 30, limit: 80, pctLimit: 8, reliability: 99.1, sector: "Private", lastSettlement: "On-time", watchlist: false },
  { name: "Bank of Baroda", rating: "A1+", agency: "CRISIL", exposure: 22, limit: 100, pctLimit: 10, reliability: 98.5, sector: "PSU", lastSettlement: "Delayed 2h", watchlist: false },
  { name: "PNB", rating: "A1", agency: "CARE", exposure: 15, limit: 60, pctLimit: 6, reliability: 97.8, sector: "PSU", lastSettlement: "On-time", watchlist: false },
  { name: "Yes Bank", rating: "A2", agency: "ICRA", exposure: 8, limit: 30, pctLimit: 3, reliability: 96.2, sector: "Private", lastSettlement: "Delayed 4h", watchlist: true },
];

const DEPLOYMENT_PORTFOLIO = [
  { instrument: "CBLO", amount: 280, pct: 35.1, rate: 6.58, maturity: "O/N", settlement: "T+0", risk: "AAA", collateral: "G-Sec", color: "#22d3ee" },
  { instrument: "Call Money", amount: 200, pct: 25.1, rate: 6.82, maturity: "O/N", settlement: "T+1", risk: "A1+", collateral: "Unsecured", color: "#a78bfa" },
  { instrument: "Overnight Repo", amount: 160, pct: 20.1, rate: 6.50, maturity: "O/N", settlement: "T+0", risk: "Sovereign", collateral: "G-Sec", color: "#34d399" },
  { instrument: "Liquid MMF", amount: 96, pct: 12.0, rate: 7.05, maturity: "Instant", settlement: "T+0", risk: "AAA", collateral: "Diversified", color: "#fbbf24" },
  { instrument: "T-Bill 91D", amount: 42, pct: 5.3, rate: 6.88, maturity: "91D", settlement: "T+1", risk: "Sovereign", collateral: "Sovereign", color: "#f87171" },
  { instrument: "Notice Money 7D", amount: 12, pct: 1.5, rate: 6.80, maturity: "7D", settlement: "T+1", risk: "A1+", collateral: "Unsecured", color: "#fb923c" },
  { instrument: "CD 3M", amount: 6, pct: 0.8, rate: 7.10, maturity: "3M", settlement: "T+1", risk: "A1+", collateral: "Bank", color: "#e879f9" },
  { instrument: "CP 1M", amount: 2, pct: 0.3, rate: 7.20, maturity: "1M", settlement: "T+1", risk: "A1", collateral: "Corporate", color: "#94a3b8" },
];

const ORDER_BOOK = Array.from({ length: 15 }, (_, i) => ({
  id: `ORD-${String(2024001 + i)}`,
  time: `${String(randInt(9, 17)).padStart(2, "0")}:${String(randInt(0, 59)).padStart(2, "0")}:${String(randInt(0, 59)).padStart(2, "0")}`,
  instrument: ["CBLO", "Call Money", "Repo", "Liquid MMF", "T-Bill", "Notice 7D"][randInt(0, 6)],
  side: Math.random() > 0.4 ? "LEND" : "BORROW",
  amount: randInt(5, 80),
  rate: rand(6.3, 7.2),
  counterparty: COUNTERPARTIES[randInt(0, 6)].name,
  status: ["FILLED", "PARTIAL", "OPEN", "FILLED", "FILLED", "CANCELLED"][randInt(0, 6)],
  fillPct: randInt(60, 100),
  platform: ["CCIL", "NDS-Call", "FX-CLEAR", "CAMS", "NDS-OM"][randInt(0, 5)],
}));

const ALERTS_FULL = [
  { type: "critical", icon: AlertTriangle, msg: "Liquidity breach predicted in 3h — inject ₹20Cr via CBLO borrowing", time: "2m ago", color: "#ef4444", module: "AI Engine", action: "Auto-borrow initiated" },
  { type: "opportunity", icon: TrendingUp, msg: "MIBOR-Repo spread at 32bps (>25bps threshold) — arbitrage available", time: "5m ago", color: "#22d3ee", module: "Optimizer", action: "Review allocation" },
  { type: "risk", icon: Shield, msg: "HDFC Bank exposure at 9.2% — approaching 10% counterparty limit", time: "12m ago", color: "#fbbf24", module: "Risk", action: "Reduce by ₹8Cr" },
  { type: "info", icon: Activity, msg: "MIBOR fixed at 6.75% (+5bps vs yesterday) — AI adjusting deployments", time: "18m ago", color: "#a78bfa", module: "AI Engine", action: "Auto-rebalance" },
  { type: "success", icon: CheckCircle, msg: "₹50Cr auto-deployed: ₹25Cr CBLO + ₹15Cr Call + ₹10Cr Repo", time: "25m ago", color: "#34d399", module: "Execution", action: "Confirmed" },
  { type: "critical", icon: AlertTriangle, msg: "GST payment ₹42Cr due in 4h — ensure current account adequacy", time: "30m ago", color: "#ef4444", module: "Forecast", action: "Schedule recall" },
  { type: "risk", icon: Shield, msg: "Yes Bank credit watch negative (ICRA) — freeze new deployments", time: "45m ago", color: "#fbbf24", module: "Risk", action: "Exposure frozen" },
  { type: "compliance", icon: FileText, msg: "Form A return auto-generated for yesterday's call money participation", time: "1h ago", color: "#3b82f6", module: "Compliance", action: "Filed" },
  { type: "opportunity", icon: TrendingUp, msg: "CD 3M rate dropped 8bps — consider T-Bill switch for better liquidity", time: "1h ago", color: "#22d3ee", module: "Optimizer", action: "Pending review" },
  { type: "info", icon: Radio, msg: "CCIL system maintenance window: 22:00-23:30 IST today", time: "2h ago", color: "#94a3b8", module: "System", action: "Noted" },
  { type: "success", icon: CheckCircle, msg: "Notice Money ₹12Cr — 7-day notice period initiated for recall", time: "2h ago", color: "#34d399", module: "Execution", action: "Timer set" },
  { type: "risk", icon: Flame, msg: "Stress test: MIBOR +200bps scenario shows ₹4.2Cr P&L impact", time: "3h ago", color: "#fb923c", module: "Risk", action: "Report ready" },
];

const STRESS_SCENARIOS = [
  { scenario: "MIBOR +200bps Spike", desc: "Sudden liquidity tightening", impact: -4.2, severity: "high", survival: 18, probability: 8, mitigation: "Pre-position CBLO borrowing lines" },
  { scenario: "Top 3 Counterparty Default", desc: "Concentration risk event", impact: -12.5, severity: "critical", survival: 6, probability: 0.5, mitigation: "Diversify across 8+ counterparties" },
  { scenario: "MMF Redemption Gate", desc: "Fund liquidity freeze", impact: -8.1, severity: "high", survival: 12, probability: 3, mitigation: "Keep MMF <15% of portfolio" },
  { scenario: "RTGS System Outage", desc: "Payment infrastructure failure", impact: -15.0, severity: "critical", survival: 4, probability: 1, mitigation: "Maintain NEFT/UPI backup channels" },
  { scenario: "RBI Emergency Rate Hike 50bps", desc: "Monetary policy shock", impact: -2.8, severity: "medium", survival: 48, probability: 5, mitigation: "OIS hedge on 40% portfolio" },
  { scenario: "USD/INR 3% Depreciation", desc: "Currency crisis", impact: -6.3, severity: "high", survival: 8, probability: 4, mitigation: "MIFOR hedge for FX exposures" },
  { scenario: "Corporate Bond Market Freeze", desc: "Credit market stress", impact: -3.5, severity: "medium", survival: 24, probability: 2, mitigation: "Rotate to sovereign instruments" },
  { scenario: "Simultaneous: Rate Hike + FX Crisis", desc: "Twin shock scenario", impact: -18.7, severity: "critical", survival: 3, probability: 0.3, mitigation: "Emergency liquidity facility" },
];

const COMPLIANCE_ITEMS = [
  { category: "RBI", item: "LCR (Liquidity Coverage Ratio)", value: 142, threshold: 100, unit: "%", status: "pass", frequency: "Daily" },
  { category: "RBI", item: "NSFR (Net Stable Funding Ratio)", value: 118, threshold: 100, unit: "%", status: "pass", frequency: "Quarterly" },
  { category: "RBI", item: "Form A Returns (Call Money)", value: "Filed", threshold: "Daily", unit: "", status: "pass", frequency: "Daily" },
  { category: "RBI", item: "SLR Maintenance", value: 19.2, threshold: 18, unit: "%", status: "pass", frequency: "Daily" },
  { category: "RBI", item: "CRR Maintenance", value: 4.52, threshold: 4.5, unit: "%", status: "warn", frequency: "Fortnightly" },
  { category: "SEBI", item: "WLA (Weekly Liquid Assets)", value: 68, threshold: 50, unit: "%", status: "pass", frequency: "Weekly" },
  { category: "SEBI", item: "MMF Single Issuer Limit", value: 8.5, threshold: 10, unit: "%", status: "pass", frequency: "Daily" },
  { category: "SEBI", item: "Non-Liquid Asset Cap (MMF)", value: 18, threshold: 25, unit: "%", status: "pass", frequency: "Daily" },
  { category: "SEBI", item: "Investment Pattern Report", value: "Generated", threshold: "Monthly", unit: "", status: "pass", frequency: "Monthly" },
  { category: "Tax", item: "GST on Brokerage", value: 2.4, threshold: "Computed", unit: "L", status: "pass", frequency: "Monthly" },
  { category: "Tax", item: "TDS on Interest Income", value: "Deducted", threshold: "Quarterly", unit: "", status: "pass", frequency: "Quarterly" },
  { category: "Audit", item: "Trade Decision Audit Trail", value: "Complete", threshold: "Immutable", unit: "", status: "pass", frequency: "Real-time" },
  { category: "Audit", item: "Access Log Integrity", value: "Verified", threshold: "Tamper-proof", unit: "", status: "pass", frequency: "Real-time" },
];

const PERF_METRICS = {
  yieldEnhancement: { value: 158, unit: "bps", label: "Yield Enhancement vs FD", target: 150, trend: [142, 145, 148, 150, 153, 155, 158] },
  idleCashReduction: { value: 43.2, unit: "%", label: "Idle Cash Reduction", target: 40, trend: [28, 32, 35, 38, 40, 42, 43.2] },
  predictionMAPE: { value: 3.8, unit: "%", label: "Forecast MAPE", target: 5, trend: [8.2, 7.1, 6.0, 5.2, 4.5, 4.1, 3.8] },
  settlementRate: { value: 100, unit: "%", label: "Settlement Success Rate", target: 100, trend: [100, 100, 100, 100, 100, 100, 100] },
  manualReduction: { value: 91, unit: "%", label: "Manual Ops Reduction", target: 90, trend: [65, 72, 78, 83, 87, 89, 91] },
  bufferEfficiency: { value: 94.7, unit: "%", label: "Buffer Utilization Efficiency", target: 90, trend: [82, 85, 88, 90, 92, 93.5, 94.7] },
  avgDeploymentTime: { value: 2.3, unit: "min", label: "Avg Deployment Time", target: 5, trend: [12, 8, 6, 4.5, 3.2, 2.8, 2.3] },
  counterpartyDiv: { value: 8, unit: "banks", label: "Counterparty Diversification", target: 6, trend: [4, 5, 5, 6, 7, 7, 8] },
};

const ERP_DATA = {
  payables: [
    { vendor: "Reliance Industries", amount: 45.2, due: "2 days", priority: "high", erp: "SAP" },
    { vendor: "L&T Engineering", amount: 28.7, due: "5 days", priority: "medium", erp: "SAP" },
    { vendor: "Infosys BPO", amount: 12.3, due: "7 days", priority: "low", erp: "Oracle" },
    { vendor: "TCS Services", amount: 8.9, due: "3 days", priority: "medium", erp: "SAP" },
    { vendor: "Wipro Ltd", amount: 6.1, due: "10 days", priority: "low", erp: "Oracle" },
  ],
  receivables: [
    { client: "Maruti Suzuki", amount: 62.5, expected: "1 day", confidence: 95, erp: "SAP" },
    { client: "Bajaj Finance", amount: 38.1, expected: "2 days", confidence: 88, erp: "SAP" },
    { client: "ITC Ltd", amount: 22.8, expected: "3 days", confidence: 92, erp: "Tally" },
    { client: "ONGC", amount: 18.4, expected: "5 days", confidence: 78, erp: "Oracle" },
    { client: "Bharti Airtel", amount: 14.2, expected: "4 days", confidence: 85, erp: "SAP" },
  ],
  upcoming: [
    { event: "Payroll Cycle", date: "Mar 1", amount: 82, type: "outflow", icon: Users },
    { event: "GST Payment", date: "Mar 20", amount: 42, type: "outflow", icon: Landmark },
    { event: "Advance Tax", date: "Mar 15", amount: 65, type: "outflow", icon: FileText },
    { event: "Bond Coupon", date: "Mar 10", amount: 15, type: "inflow", icon: CreditCard },
    { event: "Client Settlement", date: "Mar 5", amount: 55, type: "inflow", icon: Building },
  ],
};

const ACCESS_ROLES = [
  { role: "Treasurer", users: ["Rajesh Sharma", "Priya Patel"], permissions: ["Full Access", "Trade Execution", "Risk Override"], level: "Admin", twoFA: true },
  { role: "CFO", users: ["Amit Verma"], permissions: ["Dashboard View", "Approve >₹100Cr", "Risk Reports"], level: "Executive", twoFA: true },
  { role: "Trader", users: ["Vikram Singh", "Neha Gupta", "Arjun Mehta"], permissions: ["Trade Execution", "Order Management", "Rate Monitor"], level: "Operator", twoFA: true },
  { role: "Auditor", users: ["Sanjay Kumar"], permissions: ["Read-Only", "Audit Trail", "Compliance Reports", "Export Data"], level: "Observer", twoFA: true },
  { role: "Risk Manager", users: ["Deepa Iyer"], permissions: ["Risk Dashboard", "Stress Testing", "Limit Management", "Alert Config"], level: "Manager", twoFA: true },
];

const RATE_FIELDS = [
  "mibor_overnight", "mibor_14d", "mibor_1m", "mibor_3m",
  "cblo_bid", "cblo_ask", "repo", "reverse_repo",
  "cd_1m", "cd_3m", "cd_6m", "cd_12m",
  "cp_1m", "cp_3m",
  "tbill_91d", "tbill_182d", "tbill_364d",
  "mifor_1m", "mifor_3m", "mifor_6m",
  "sofr", "usdinr_spot", "usdinr_1m_fwd",
  "ois_1y", "ois_3y", "ois_5y", "gsec_10y",
  "call_money_high", "call_money_low",
  "notice_7d", "notice_14d",
  "mmf_liquid", "mmf_overnight", "mmf_ultra_short",
];

const EXEC_INSTRUMENTS = ["CBLO", "Call Money", "O/N Repo", "Liquid MMF", "T-Bill 91D", "Notice Money 7D", "CD 3M", "CP 1M"];
const EXEC_SIDES = ["LEND", "BORROW"];
const ENGINE_STORAGE_KEY = "liquifi.backend.state.v1";
const ENGINE_SCHEMA_VERSION = 1;
const ENGINE_LIMITS = {
  maxRateHistory: 240,
  maxEvents: 140,
  maxQueueSize: 80,
  rateLimitPerMinute: 20,
  maxOrderAmountCr: 150,
  maxRetryAttempts: 3,
  circuitOpenAfterFailures: 4,
  circuitCooldownMs: 20_000,
  maxIdempotencyKeys: 300,
};

const safeJsonParse = (raw, fallback = null) => {
  if (!raw || typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const storageRead = (key, fallback = null) => {
  if (typeof window === "undefined") return fallback;
  try {
    return safeJsonParse(window.localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
};

const storageWrite = (key, value) => {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const backendId = (prefix = "id") => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const validateRates = (candidate, fallback = generateRates()) => {
  const next = { ...fallback };
  let corrected = false;

  RATE_FIELDS.forEach((field) => {
    const value = candidate?.[field];
    if (typeof value === "number" && Number.isFinite(value)) {
      next[field] = +clamp(value, 0, 200).toFixed(4);
    } else {
      corrected = true;
    }
  });

  if (next.cblo_ask < next.cblo_bid) {
    next.cblo_ask = +(next.cblo_bid + 0.01).toFixed(4);
    corrected = true;
  }
  if (next.call_money_high < next.call_money_low) {
    const prevHigh = next.call_money_high;
    next.call_money_high = next.call_money_low;
    next.call_money_low = prevHigh;
    corrected = true;
  }

  return { rates: next, corrected };
};

const createBackendEvent = (level, module, message, meta = {}) => ({
  id: backendId("evt"),
  ts: new Date().toISOString(),
  level,
  module,
  message,
  meta,
});

const createBackendEngine = (seedRates = generateRates()) => {
  let state = {
    schemaVersion: ENGINE_SCHEMA_VERSION,
    rates: validateRates(seedRates, seedRates).rates,
    rateHistory: [],
    events: [],
    orderQueue: [],
    processedKeys: new Set(),
    rateLimiterBucket: [],
    killSwitch: false,
    flags: {
      spreadAlert: false,
      fxAlert: false,
    },
    metrics: {
      ticks: 0,
      processedOrders: 0,
      rejectedOrders: 0,
      failedAttempts: 0,
      hardFailures: 0,
      retries: 0,
      rateCorrections: 0,
      consecutiveFailures: 0,
      circuitState: "closed",
      circuitOpenedAt: null,
    },
  };

  const trimProcessedKeys = () => {
    if (state.processedKeys.size <= ENGINE_LIMITS.maxIdempotencyKeys) return;
    state.processedKeys = new Set(Array.from(state.processedKeys).slice(-ENGINE_LIMITS.maxIdempotencyKeys));
  };

  const pushEvent = (event) => {
    state.events = [event, ...state.events].slice(0, ENGINE_LIMITS.maxEvents);
  };

  const persist = () => {
    storageWrite(ENGINE_STORAGE_KEY, {
      schemaVersion: state.schemaVersion,
      rates: state.rates,
      rateHistory: state.rateHistory,
      events: state.events,
      orderQueue: state.orderQueue,
      processedKeys: Array.from(state.processedKeys),
      killSwitch: state.killSwitch,
      flags: state.flags,
      metrics: state.metrics,
    });
  };

  const setCircuitState = (next, reason) => {
    if (state.metrics.circuitState === next) return;
    state.metrics.circuitState = next;
    if (next === "open") {
      state.metrics.circuitOpenedAt = Date.now();
    } else if (next === "closed") {
      state.metrics.circuitOpenedAt = null;
      state.metrics.consecutiveFailures = 0;
    }
    pushEvent(createBackendEvent(next === "open" ? "error" : "info", "Resilience", `Circuit ${next.toUpperCase()}${reason ? `: ${reason}` : ""}`));
  };

  const hydrate = () => {
    const persisted = storageRead(ENGINE_STORAGE_KEY, null);
    if (!persisted || persisted.schemaVersion !== ENGINE_SCHEMA_VERSION) {
      pushEvent(createBackendEvent("info", "Backend", "Fresh engine boot (no persisted state)."));
      persist();
      return;
    }

    const validated = validateRates(persisted.rates, state.rates);
    state.rates = validated.rates;
    state.rateHistory = Array.isArray(persisted.rateHistory) ? persisted.rateHistory.slice(-ENGINE_LIMITS.maxRateHistory) : [];
    state.events = Array.isArray(persisted.events) ? persisted.events.slice(0, ENGINE_LIMITS.maxEvents) : [];
    state.orderQueue = Array.isArray(persisted.orderQueue) ? persisted.orderQueue.slice(0, ENGINE_LIMITS.maxQueueSize) : [];
    state.processedKeys = new Set(Array.isArray(persisted.processedKeys) ? persisted.processedKeys : []);
    state.killSwitch = Boolean(persisted.killSwitch);
    state.flags = { ...state.flags, ...(persisted.flags || {}) };
    state.metrics = { ...state.metrics, ...(persisted.metrics || {}) };
    trimProcessedKeys();

    if (validated.corrected) {
      state.metrics.rateCorrections += 1;
      pushEvent(createBackendEvent("warn", "Validation", "Persisted rates required sanitization during boot."));
    }
    pushEvent(createBackendEvent("info", "Backend", "Engine state restored from local storage."));
    persist();
  };

  const pruneRateLimitBucket = (now) => {
    state.rateLimiterBucket = state.rateLimiterBucket.filter((ts) => now - ts < 60_000);
  };

  const acceptRateLimitedRequest = () => {
    const now = Date.now();
    pruneRateLimitBucket(now);
    if (state.rateLimiterBucket.length >= ENGINE_LIMITS.rateLimitPerMinute) {
      return false;
    }
    state.rateLimiterBucket.push(now);
    return true;
  };

  const submitOrder = (input, options = {}) => {
    if (state.killSwitch) {
      state.metrics.rejectedOrders += 1;
      return { ok: false, error: "Kill switch is active. Order intake is disabled." };
    }
    if (state.metrics.circuitState === "open") {
      state.metrics.rejectedOrders += 1;
      return { ok: false, error: "Circuit breaker is OPEN. Retry after cooldown." };
    }
    if (!options.skipRateLimit && !acceptRateLimitedRequest()) {
      state.metrics.rejectedOrders += 1;
      pushEvent(createBackendEvent("warn", "Gateway", "Rate limit exceeded for order API."));
      persist();
      return { ok: false, error: "Rate limit exceeded (20 orders/min)." };
    }
    if (state.orderQueue.length >= ENGINE_LIMITS.maxQueueSize) {
      state.metrics.rejectedOrders += 1;
      pushEvent(createBackendEvent("error", "Gateway", "Order queue is full. Request rejected."));
      persist();
      return { ok: false, error: "Order queue full. Try again shortly." };
    }

    const instrument = EXEC_INSTRUMENTS.includes(input?.instrument) ? input.instrument : null;
    const side = EXEC_SIDES.includes(input?.side) ? input.side : null;
    const amount = Number(input?.amount);
    const rate = Number(input?.rate);
    const idempotencyKey = String(input?.idempotencyKey || backendId("idem"));

    if (!instrument || !side || !Number.isFinite(amount) || !Number.isFinite(rate) || amount <= 0 || rate <= 0) {
      state.metrics.rejectedOrders += 1;
      return { ok: false, error: "Invalid payload. Provide valid instrument, side, amount, and rate." };
    }
    if (amount > ENGINE_LIMITS.maxOrderAmountCr) {
      state.metrics.rejectedOrders += 1;
      return { ok: false, error: `Order amount exceeds ${ENGINE_LIMITS.maxOrderAmountCr}Cr limit.` };
    }
    if (state.processedKeys.has(idempotencyKey) || state.orderQueue.some((o) => o.idempotencyKey === idempotencyKey)) {
      state.metrics.rejectedOrders += 1;
      return { ok: false, error: "Duplicate idempotency key. Request replay blocked." };
    }

    const order = {
      id: backendId("ord"),
      idempotencyKey,
      instrument,
      side,
      amount: +amount.toFixed(2),
      rate: +rate.toFixed(4),
      counterparty: String(input?.counterparty || "Liquidity Pool"),
      platform: String(input?.platform || "Engine"),
      status: "queued",
      attempts: 0,
      nextAttemptAt: Date.now(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null,
    };

    state.orderQueue.unshift(order);
    pushEvent(createBackendEvent("info", "Gateway", `Order accepted: ${order.id} (${order.instrument} ${order.side} ₹${order.amount}Cr @ ${order.rate.toFixed(2)}%)`));
    persist();
    return { ok: true, orderId: order.id, idempotencyKey: order.idempotencyKey };
  };

  const processQueue = () => {
    if (state.killSwitch) return;

    const now = Date.now();
    if (state.metrics.circuitState === "open") {
      if (state.metrics.circuitOpenedAt && now - state.metrics.circuitOpenedAt >= ENGINE_LIMITS.circuitCooldownMs) {
        setCircuitState("half_open", "cooldown elapsed");
      } else {
        return;
      }
    }

    state.orderQueue = state.orderQueue
      .map((order) => {
        if (!["queued", "retry"].includes(order.status)) return order;
        if ((order.nextAttemptAt || 0) > now) return order;

        const shouldFail = Math.random() < (order.amount > 40 ? 0.18 : 0.08);

        if (shouldFail) {
          const attempts = order.attempts + 1;
          state.metrics.failedAttempts += 1;
          state.metrics.consecutiveFailures += 1;

          if (attempts >= ENGINE_LIMITS.maxRetryAttempts) {
            state.metrics.hardFailures += 1;
            if (state.metrics.consecutiveFailures >= ENGINE_LIMITS.circuitOpenAfterFailures) {
              setCircuitState("open", "consecutive settlement failures");
            }
            pushEvent(createBackendEvent("error", "Execution", `Order ${order.id} failed permanently after ${attempts} attempts.`));
            return {
              ...order,
              attempts,
              status: "failed",
              updatedAt: new Date().toISOString(),
              lastError: "Settlement gateway timeout",
            };
          }

          state.metrics.retries += 1;
          pushEvent(createBackendEvent("warn", "Execution", `Order ${order.id} retry scheduled (attempt ${attempts + 1}).`));
          return {
            ...order,
            attempts,
            status: "retry",
            nextAttemptAt: now + attempts * 2000,
            updatedAt: new Date().toISOString(),
            lastError: "Transient settlement timeout",
          };
        }

        state.metrics.processedOrders += 1;
        state.metrics.consecutiveFailures = 0;
        state.processedKeys.add(order.idempotencyKey);
        trimProcessedKeys();
        if (state.metrics.circuitState === "half_open") {
          setCircuitState("closed", "recovery probe succeeded");
        }
        pushEvent(createBackendEvent("success", "Execution", `Order ${order.id} settled successfully.`));
        return {
          ...order,
          status: "settled",
          updatedAt: new Date().toISOString(),
          settledAt: new Date().toISOString(),
          lastError: null,
        };
      })
      .slice(0, ENGINE_LIMITS.maxQueueSize);

    persist();
  };

  const tick = () => {
    const generated = generateRates(state.rates);
    const validated = validateRates(generated, state.rates);
    state.rates = validated.rates;
    state.metrics.ticks += 1;

    if (validated.corrected) {
      state.metrics.rateCorrections += 1;
      pushEvent(createBackendEvent("warn", "Validation", "Incoming rate snapshot corrected by guardrails."));
    }

    const spread = +((state.rates.mibor_overnight - state.rates.repo) * 100).toFixed(2);
    if (spread > 35 && !state.flags.spreadAlert) {
      state.flags.spreadAlert = true;
      pushEvent(createBackendEvent("warn", "Risk", `Spread stress: MIBOR-Repo at ${spread}bps.`));
    }
    if (spread < 28 && state.flags.spreadAlert) {
      state.flags.spreadAlert = false;
      pushEvent(createBackendEvent("info", "Risk", `Spread normalized: MIBOR-Repo at ${spread}bps.`));
    }
    if (state.rates.usdinr_spot > 84.5 && !state.flags.fxAlert) {
      state.flags.fxAlert = true;
      pushEvent(createBackendEvent("warn", "FX", `USD/INR elevated at ${state.rates.usdinr_spot.toFixed(2)}.`));
    }
    if (state.rates.usdinr_spot < 84.1 && state.flags.fxAlert) {
      state.flags.fxAlert = false;
      pushEvent(createBackendEvent("info", "FX", `USD/INR normalized at ${state.rates.usdinr_spot.toFixed(2)}.`));
    }

    state.rateHistory.push({
      ts: new Date().toISOString(),
      mibor: state.rates.mibor_overnight,
      repo: state.rates.repo,
      spread,
      cblo: state.rates.cblo_bid,
      usdinr: state.rates.usdinr_spot,
    });
    if (state.rateHistory.length > ENGINE_LIMITS.maxRateHistory) {
      state.rateHistory = state.rateHistory.slice(-ENGINE_LIMITS.maxRateHistory);
    }

    persist();
    return state.rates;
  };

  const runChaosBurst = () => {
    const samples = [
      { instrument: "CBLO", side: "LEND", amount: 18, rate: state.rates.cblo_bid },
      { instrument: "Call Money", side: "LEND", amount: 25, rate: state.rates.mibor_overnight },
      { instrument: "O/N Repo", side: "BORROW", amount: 42, rate: state.rates.repo + 0.1 },
      { instrument: "Liquid MMF", side: "LEND", amount: 12, rate: state.rates.mmf_liquid },
      { instrument: "Notice Money 7D", side: "LEND", amount: 8, rate: state.rates.notice_7d },
    ];
    samples.forEach((sample) => {
      submitOrder({ ...sample, idempotencyKey: backendId("drill") }, { skipRateLimit: true });
    });
    pushEvent(createBackendEvent("warn", "Chaos", "Chaos drill injected burst traffic into execution queue."));
    persist();
  };

  const setKillSwitch = (enabled) => {
    const next = Boolean(enabled);
    if (state.killSwitch === next) return state.killSwitch;
    state.killSwitch = next;
    pushEvent(createBackendEvent(next ? "error" : "info", "Controls", next ? "Kill switch enabled. Order intake paused." : "Kill switch disabled. Order intake resumed."));
    persist();
    return state.killSwitch;
  };

  const forceRecover = () => {
    setCircuitState("closed", "manual operator recovery");
    persist();
  };

  const getSnapshot = () => ({
    rates: state.rates,
    rateHistory: state.rateHistory,
    events: state.events,
    orderQueue: state.orderQueue,
    killSwitch: state.killSwitch,
    metrics: state.metrics,
    processedKeyCount: state.processedKeys.size,
  });

  return {
    hydrate,
    tick,
    submitOrder,
    processQueue,
    runChaosBurst,
    setKillSwitch,
    forceRecover,
    getSnapshot,
  };
};

const INTEGRATION_BLUEPRINT = [
  { system: "CCIL (CBLO/Repo)", status: "Connected", latency: 12, uptime: 99.99 },
  { system: "NDS-OM (T-Bills/G-Sec)", status: "Connected", latency: 18, uptime: 99.95 },
  { system: "NDS-Call (Call Money)", status: "Connected", latency: 15, uptime: 99.98 },
  { system: "FX-CLEAR (Forex)", status: "Connected", latency: 22, uptime: 99.92 },
  { system: "CAMS/Karvy (MF)", status: "Connected", latency: 45, uptime: 99.85 },
  { system: "FBIL (Rate Feeds)", status: "Connected", latency: 8, uptime: 99.99 },
  { system: "FIMMDA (CD Rates)", status: "Connected", latency: 35, uptime: 99.90 },
  { system: "Bank APIs (RTGS/NEFT)", status: "Connected", latency: 28, uptime: 99.95 },
  { system: "SAP/Oracle ERP", status: "Connected", latency: 65, uptime: 99.80 },
  { system: "Apache Kafka (MQ)", status: "Healthy", latency: 3, uptime: 99.99 },
  { system: "TimescaleDB", status: "Healthy", latency: 5, uptime: 99.99 },
  { system: "MLflow Pipeline", status: "Healthy", latency: null, uptime: 99.95 },
];

const COUNTERPARTY_ALIASES = {
  sbi: "SBI",
  hdfc: "HDFC Bank",
  "hdfc bank": "HDFC Bank",
  icici: "ICICI Bank",
  "icici bank": "ICICI Bank",
  axis: "Axis Bank",
  "axis bank": "Axis Bank",
  kotak: "Kotak Mahindra",
  "kotak mahindra": "Kotak Mahindra",
  bob: "Bank of Baroda",
  "bank of baroda": "Bank of Baroda",
  pnb: "PNB",
  "yes bank": "Yes Bank",
};

const formatLatency = (latency) => (latency == null ? "N/A" : `${latency.toFixed(0)}ms`);
const formatUptime = (uptime) => `${uptime.toFixed(2)}%`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const createId = (prefix) => `${prefix}-${Date.now()}-${randInt(1000, 9999)}`;
const randomOf = (list) => list[randInt(0, list.length)];
const shortHash = () => `${Math.random().toString(36).slice(2, 6)}...${Math.random().toString(36).slice(2, 6)}`;
const isInfraCounterparty = (name = "") => /ccil|triparty|liquid/i.test(name);

const resolveCounterparty = (rawName = "") => {
  if (!rawName) return null;
  const key = rawName.trim().toLowerCase();
  const normalized = COUNTERPARTY_ALIASES[key] || rawName.trim();
  return COUNTERPARTIES.find((cp) => cp.name.toLowerCase() === normalized.toLowerCase()) || null;
};

const createAuditEntry = ({ action, detail, actor = "System", level = "info" }) => ({
  id: createId("AUD"),
  time: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }),
  action,
  detail,
  user: actor,
  level,
  hash: shortHash(),
});

const seedAuditTrail = () => [
  { id: createId("AUD"), time: "14:32:18", action: "AUTO_DEPLOY", detail: "₹20Cr CBLO lend to SBI via CCIL", user: "AI Engine", level: "info", hash: "a3f8...c2d1" },
  { id: createId("AUD"), time: "14:30:05", action: "RATE_UPDATE", detail: "MIBOR O/N fixed at 6.75% (FBIL)", user: "System", level: "info", hash: "b7e2...f4a9" },
  { id: createId("AUD"), time: "14:28:42", action: "RISK_ALERT", detail: "HDFC exposure 9.2% — within 0.8% of limit", user: "Risk Engine", level: "warn", hash: "c1d5...e8b3" },
  { id: createId("AUD"), time: "14:25:10", action: "COMPLIANCE", detail: "Form A return auto-generated and filed", user: "Compliance Bot", level: "info", hash: "d4f7...a1c6" },
  { id: createId("AUD"), time: "14:20:33", action: "FORECAST", detail: "LSTM retrained — MAPE improved 4.1% → 3.8%", user: "ML Pipeline", level: "info", hash: "e6a2...b5d8" },
  { id: createId("AUD"), time: "14:15:00", action: "MANUAL_OVERRIDE", detail: "Treasurer approved ₹10Cr increase to Axis limit", user: "Rajesh Sharma", level: "warn", hash: "f8c3...d2e7" },
];

const createRealtimePayment = () => ({
  id: createId("TXN"),
  type: randomOf(["RTGS", "NEFT", "UPI", "IMPS"]),
  direction: Math.random() > 0.48 ? "credit" : "debit",
  amount: rand(0.5, 90),
  counterparty: randomOf(["Reliance Industries", "TCS", "Infosys", "HDFC Ltd", "L&T", "Bajaj Finance", "Maruti Suzuki", "ITC Ltd", "ONGC", "SBI"]),
  status: randomOf(["settled", "pending", "processing", "settled", "settled", "failed"]),
  time: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }),
  iso20022: `pacs.008.${String(randInt(100, 999))}`,
  bank: randomOf(["SBI", "HDFC", "ICICI", "Axis", "Kotak", "Yes Bank"]),
});

const createBackendState = () => ({
  killSwitch: false,
  failoverMode: "auto",
  circuitOpen: false,
  circuitOpenedAt: null,
  queueDepth: 6,
  throughputPerMin: 268,
  processedTx24h: 1248,
  failedTx24h: 4,
  successRate: 99.68,
  apiLatencyP99: 23,
  idempotencyKeys: [],
  deploymentCount: 0,
  lastDeploySummary: "",
  orderBook: ORDER_BOOK,
  paymentStreams: PAYMENT_STREAMS,
  integrations: INTEGRATION_BLUEPRINT.map((sys) => ({ ...sys })),
  auditTrail: seedAuditTrail(),
});

const validateDeploymentPlan = (plan, surplus, killSwitch = false) => {
  const errors = [];
  const warnings = [];
  const cpDelta = {};
  let total = 0;

  if (killSwitch) {
    errors.push("Global kill switch is active. Deployments are blocked.");
  }
  if (!Array.isArray(plan) || plan.length === 0) {
    errors.push("Deployment plan is empty.");
    return { valid: false, errors, warnings, total: 0 };
  }

  plan.forEach((leg, idx) => {
    const amount = Number(leg.amount);
    const rate = Number(leg.rate);
    const legLabel = leg.instrument || `Leg ${idx + 1}`;
    total += Number.isFinite(amount) ? amount : 0;

    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push(`${legLabel}: amount must be > 0.`);
    }
    if (!Number.isFinite(rate) || rate <= 0 || rate > 30) {
      errors.push(`${legLabel}: rate must be in (0, 30].`);
    }

    const splits = Array.isArray(leg.splits) ? leg.splits : [];
    const splitTotal = splits.reduce((sum, split) => sum + (Number(split.amt) || 0), 0);
    if (Math.abs(splitTotal - amount) > 0.01) {
      errors.push(`${legLabel}: split total ₹${splitTotal.toFixed(1)}Cr does not match leg amount ₹${amount.toFixed(1)}Cr.`);
    }

    splits.forEach((split) => {
      const splitAmt = Number(split.amt) || 0;
      const cpName = split.cp || "";
      const cp = resolveCounterparty(cpName);

      if (!cp && !isInfraCounterparty(cpName)) {
        warnings.push(`${legLabel}: ${cpName} not mapped to known counterparty limits.`);
        return;
      }
      if (!cp) return;

      cpDelta[cp.name] = (cpDelta[cp.name] || 0) + splitAmt;
      const projectedExposure = cp.exposure + cpDelta[cp.name];
      const projectedUtilization = projectedExposure / cp.limit;

      if (cp.watchlist) {
        errors.push(`${legLabel}: ${cp.name} is watchlisted and cannot receive new deployment.`);
      }
      if (projectedExposure > cp.limit) {
        errors.push(`${legLabel}: ${cp.name} exceeds limit (${projectedExposure.toFixed(1)}Cr > ${cp.limit}Cr).`);
      } else if (projectedUtilization > 0.9) {
        warnings.push(`${legLabel}: ${cp.name} projected utilization at ${(projectedUtilization * 100).toFixed(1)}%.`);
      }
    });
  });

  if (total > surplus + 0.01) {
    errors.push(`Plan total ₹${total.toFixed(1)}Cr exceeds available surplus ₹${surplus.toFixed(1)}Cr.`);
  }

  return { valid: errors.length === 0, errors, warnings, total: +total.toFixed(2) };
};

const exportJsonFile = (filename, payload) => {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

/* ═══════════════════════════════════════════════════════════
   SECTION 2: STYLES
   ═══════════════════════════════════════════════════════════ */

const css = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700;800&family=Outfit:wght@300;400;500;600;700;800;900&display=swap');

  :root {
    --bg-0: #050810;
    --bg-1: #0a0f1a;
    --bg-2: #0f1628;
    --bg-3: #151e35;
    --bg-4: #1a2744;
    --bg-hover: #1e2d50;
    --border-1: #1a2540;
    --border-2: #243356;
    --border-3: #2e4070;
    --text-0: #ffffff;
    --text-1: #e2e8f0;
    --text-2: #94a3b8;
    --text-3: #64748b;
    --text-4: #475569;
    --cyan: #06d6e0;
    --cyan-dim: #0891a2;
    --purple: #a78bfa;
    --purple-dim: #7c3aed;
    --green: #10b981;
    --green-dim: #059669;
    --amber: #f59e0b;
    --amber-dim: #d97706;
    --red: #ef4444;
    --red-dim: #dc2626;
    --blue: #3b82f6;
    --blue-dim: #2563eb;
    --orange: #fb923c;
    --pink: #ec4899;
    --teal: #14b8a6;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg-0);
    color: var(--text-1);
    font-family: 'Outfit', sans-serif;
    -webkit-font-smoothing: antialiased;
  }

  .mono { font-family: 'JetBrains Mono', monospace; }

  @keyframes pulse-glow { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
  @keyframes slide-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes slide-right { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes breathe { 0%, 100% { box-shadow: 0 0 8px rgba(6,214,224,0.2); } 50% { box-shadow: 0 0 20px rgba(6,214,224,0.4); } }
  @keyframes scan-line { 0% { top: 0%; } 100% { top: 100%; } }

  .anim-in { animation: slide-up 0.35s ease-out both; }
  .anim-fade { animation: fade-in 0.4s ease-out both; }

  .card {
    background: var(--bg-2);
    border: 1px solid var(--border-1);
    border-radius: 10px;
    padding: 18px;
    transition: all 0.2s;
    position: relative;
    overflow: hidden;
  }
  .card:hover { border-color: var(--border-2); }
  .card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(6,214,224,0.15), transparent);
  }

  .card-glow {
    position: relative;
  }
  .card-glow::after {
    content: '';
    position: absolute;
    top: -1px; left: -1px; right: -1px; bottom: -1px;
    border-radius: 11px;
    background: linear-gradient(135deg, rgba(6,214,224,0.08), transparent, rgba(167,139,250,0.08));
    z-index: -1;
    pointer-events: none;
  }

  .btn-primary {
    background: linear-gradient(135deg, var(--cyan), var(--blue));
    border: none;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
    font-family: 'Outfit', sans-serif;
    letter-spacing: 0.01em;
  }
  .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(6,214,224,0.25); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

  .btn-ghost {
    background: transparent;
    border: 1px solid var(--border-1);
    color: var(--text-2);
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: all 0.2s;
    font-family: 'Outfit', sans-serif;
  }
  .btn-ghost:hover { border-color: var(--border-2); color: var(--text-1); background: var(--bg-3); }

  .badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .progress-bar { height: 5px; border-radius: 3px; background: var(--bg-1); overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 3px; transition: width 0.8s cubic-bezier(0.4,0,0.2,1); }

  .tab-btn {
    padding: 9px 16px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-3);
    font-family: 'Outfit', sans-serif;
    display: flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .tab-btn.active { background: var(--bg-3); border-color: var(--border-2); color: var(--cyan); }
  .tab-btn:hover:not(.active) { color: var(--text-2); background: var(--bg-2); }

  .table-row {
    display: grid;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-1);
    align-items: center;
    font-size: 12px;
    transition: background 0.15s;
  }
  .table-row:hover { background: var(--bg-3); }
  .table-header {
    font-size: 10px;
    color: var(--text-4);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 8px 14px;
    border-bottom: 1px solid var(--border-2);
  }

  .scrollbar-thin::-webkit-scrollbar { width: 4px; }
  .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
  .scrollbar-thin::-webkit-scrollbar-thumb { background: var(--border-2); border-radius: 2px; }
  .scrollbar-thin::-webkit-scrollbar-thumb:hover { background: var(--border-3); }

  .rate-ticker-wrap { overflow: hidden; }
  .rate-ticker-inner { display: flex; gap: 28px; animation: ticker 40s linear infinite; width: max-content; }

  .input-field {
    background: var(--bg-1);
    border: 1px solid var(--border-1);
    color: var(--text-1);
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 13px;
    font-family: 'JetBrains Mono', monospace;
    outline: none;
    transition: border-color 0.2s;
    width: 100%;
  }
  .input-field:focus { border-color: var(--cyan); }

  .grid-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image: 
      linear-gradient(rgba(6,214,224,0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(6,214,224,0.02) 1px, transparent 1px);
    background-size: 60px 60px;
    pointer-events: none;
    z-index: 0;
  }

  .status-dot {
    width: 7px; height: 7px; border-radius: 50%;
    flex-shrink: 0;
  }
  .status-dot.live { background: var(--green); animation: pulse-glow 2s ease-in-out infinite; }
  .status-dot.warn { background: var(--amber); animation: pulse-glow 1.5s ease-in-out infinite; }
  .status-dot.error { background: var(--red); animation: pulse-glow 1s ease-in-out infinite; }
`;

/* ═══════════════════════════════════════════════════════════
   SECTION 3: SHARED COMPONENTS
   ═══════════════════════════════════════════════════════════ */

const Tt = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#151e35", border: "1px solid #2e4070", borderRadius: 8, padding: "10px 14px", fontSize: 11 }}>
      <p className="mono" style={{ color: "#64748b", marginBottom: 6, fontSize: 10 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="mono" style={{ color: p.color || "#e2e8f0", fontSize: 11, lineHeight: 1.6 }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
        </p>
      ))}
    </div>
  );
};

const SectionTitle = ({ icon: Icon, title, subtitle, color = "var(--cyan)", badge, right }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
    <div>
      <h3 style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
        {Icon && <Icon size={15} color={color} />} {title}
        {badge && <span className="badge mono" style={{ background: `${color}18`, color }}>{badge}</span>}
      </h3>
      {subtitle && <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 3 }}>{subtitle}</p>}
    </div>
    {right}
  </div>
);

const StatBox = ({ label, value, sub, color, icon: Icon, small }) => (
  <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: small ? "10px 12px" : "14px 16px", border: "1px solid var(--border-1)" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: small ? 4 : 8 }}>
      <span style={{ fontSize: 10, color: "var(--text-4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      {Icon && <Icon size={small ? 12 : 14} color={color || "var(--text-3)"} />}
    </div>
    <div className="mono" style={{ fontSize: small ? 16 : 22, fontWeight: 700, color: color || "var(--text-0)", lineHeight: 1.1 }}>{value}</div>
    {sub && <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>{sub}</div>}
  </div>
);

const MiniSparkline = ({ data, color = "#06d6e0", height = 30, width = 80 }) => {
  if (!Array.isArray(data) || data.length === 0) return null;
  if (data.length === 1) {
    const y = height / 2;
    return (
      <svg width={width} height={height} style={{ display: "block" }}>
        <line x1="0" y1={y} x2={width} y2={y} stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const StatusBadge = ({ status }) => {
  const config = {
    FILLED: { bg: "rgba(16,185,129,0.12)", color: "var(--green)" },
    PARTIAL: { bg: "rgba(245,158,11,0.12)", color: "var(--amber)" },
    OPEN: { bg: "rgba(59,130,246,0.12)", color: "var(--blue)" },
    CANCELLED: { bg: "rgba(239,68,68,0.08)", color: "var(--red)" },
    FAILED: { bg: "rgba(239,68,68,0.14)", color: "var(--red)" },
    blocked: { bg: "rgba(239,68,68,0.14)", color: "var(--red)" },
    queued: { bg: "rgba(59,130,246,0.1)", color: "var(--blue)" },
    retry: { bg: "rgba(245,158,11,0.12)", color: "var(--amber)" },
    retrying: { bg: "rgba(245,158,11,0.12)", color: "var(--amber)" },
    pass: { bg: "rgba(16,185,129,0.12)", color: "var(--green)" },
    warn: { bg: "rgba(245,158,11,0.12)", color: "var(--amber)" },
    fail: { bg: "rgba(239,68,68,0.12)", color: "var(--red)" },
    settled: { bg: "rgba(16,185,129,0.1)", color: "var(--green)" },
    pending: { bg: "rgba(245,158,11,0.1)", color: "var(--amber)" },
    processing: { bg: "rgba(59,130,246,0.1)", color: "var(--blue)" },
    failed: { bg: "rgba(239,68,68,0.12)", color: "var(--red)" },
  };
  const c = config[status] || config.OPEN;
  return <span className="badge mono" style={{ background: c.bg, color: c.color }}>{status}</span>;
};

/* ═══════════════════════════════════════════════════════════
   SECTION 4: TAB — COMMAND CENTER
   ═══════════════════════════════════════════════════════════ */

const TabCommandCenter = ({ rates, clockData, historicalRates, cashFlowHistory, paymentStreams }) => {
  const yieldToday = { call: 8.2, cblo: 3.1, repo: 2.4, mmf: 1.0, tbill: 0.5, notice: 0.3 };
  const total = Object.values(yieldToday).reduce((a, b) => a + b, 0);
  const totalDeployed = DEPLOYMENT_PORTFOLIO.reduce((a, b) => a + b.amount, 0);
  const totalBalance = BANK_ACCOUNTS.reduce((a, b) => a + b.balance, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Top Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <StatBox label="Total Cash Position" value={`₹${(totalBalance + totalDeployed).toFixed(0)}Cr`} sub="Across 6 bank accounts" color="var(--cyan)" icon={Wallet} />
        <StatBox label="Deployed Capital" value={`₹${totalDeployed}Cr`} sub={`${((totalDeployed / (totalBalance + totalDeployed)) * 100).toFixed(1)}% utilization`} color="var(--purple)" icon={Layers} />
        <StatBox label="Current Account" value={`₹${totalBalance.toFixed(1)}Cr`} sub="Available for instant payments" color="var(--blue)" icon={Building} />
        <StatBox label="Today's Yield" value={`₹${total.toFixed(1)}L`} sub="+158bps vs FD benchmark" color="var(--green)" icon={TrendingUp} />
        <StatBox label="Liquidity at Risk" value="₹18.5Cr" sub="99% VaR (1-day horizon)" color="var(--amber)" icon={Shield} />
        <StatBox label="Prediction Accuracy" value="96.2%" sub="MAPE: 3.8% (7-day avg)" color="var(--teal)" icon={Brain} />
      </div>

      {/* Liquidity Clock — Full Width */}
      <div className="card card-glow">
        <SectionTitle icon={Clock} title="Liquidity Clock — 24h Forecast" subtitle="LSTM model prediction with 95%/99% confidence intervals • Retrained at 06:00 IST today" badge="LIVE" right={
          <div style={{ display: "flex", gap: 14, fontSize: 10, color: "var(--text-3)", alignItems: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 2, background: "var(--cyan)", borderRadius: 1, display: "inline-block" }} /> Actual</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 2, background: "var(--purple)", borderRadius: 1, display: "inline-block", opacity: 0.7 }} /> Predicted</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 3, background: "rgba(167,139,250,0.15)", borderRadius: 1, display: "inline-block" }} /> 95% CI</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 2, background: "var(--red)", borderRadius: 1, display: "inline-block", opacity: 0.5 }} /> Min Buffer</span>
          </div>
        } />
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={clockData}>
            <defs>
              <linearGradient id="gCyan" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#06d6e0" stopOpacity={0.2} /><stop offset="100%" stopColor="#06d6e0" stopOpacity={0} /></linearGradient>
              <linearGradient id="gCI" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a78bfa" stopOpacity={0.12} /><stop offset="100%" stopColor="#a78bfa" stopOpacity={0.02} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" stroke="rgba(30,37,64,0.8)" />
            <XAxis dataKey="hour" tick={{ fill: "#475569", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={{ stroke: "#1a2540" }} tickLine={false} interval={1} />
            <YAxis tick={{ fill: "#475569", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}Cr`} domain={["auto", "auto"]} />
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
        {/* Cash Waterfall */}
        <div className="card">
          <SectionTitle icon={BarChart3} title="Cash Position Waterfall" subtitle="Real-time position across all pools" color="var(--green)" />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Current Account (Idle)", value: totalBalance.toFixed(1), pct: 100, color: "var(--cyan)" },
              ...DEPLOYMENT_PORTFOLIO.map(d => ({ label: `${d.instrument}`, value: d.amount.toFixed(0), pct: (d.amount / totalDeployed * 90 + 10), color: d.color })),
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

        {/* Yield Attribution */}
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
                const names = { call: "Call Money", cblo: "CBLO", repo: "Repo", mmf: "Liquid MMF", tbill: "T-Bills", notice: "Notice Money" };
                const colors = { call: "#a78bfa", cblo: "#06d6e0", repo: "#10b981", mmf: "#f59e0b", tbill: "#ef4444", notice: "#fb923c" };
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

        {/* Active Alerts */}
        <div className="card">
          <SectionTitle icon={Bell} title="Active Alerts" color="var(--red)" badge={`${ALERTS_FULL.length}`} right={<button className="btn-ghost"><Settings size={12} /> Config</button>} />
          <div className="scrollbar-thin" style={{ maxHeight: 280, overflowY: "auto" }}>
            {ALERTS_FULL.slice(0, 8).map((a, i) => {
              const Icon = a.icon;
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
        {/* Historical Rates */}
        <div className="card">
          <SectionTitle icon={Activity} title="90-Day Rate History" subtitle="MIBOR vs CBLO vs Repo — basis point spread analysis" color="var(--purple)" />
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={historicalRates}>
              <CartesianGrid strokeDasharray="3 6" stroke="rgba(30,37,64,0.5)" />
              <XAxis dataKey="day" tick={false} axisLine={{ stroke: "#1a2540" }} />
              <YAxis yAxisId="left" tick={{ fill: "#475569", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={v => `${v}%`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: "#475569", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}bps`} />
              <Tooltip content={<Tt />} />
              <Line yAxisId="left" type="monotone" dataKey="mibor" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="MIBOR" />
              <Line yAxisId="left" type="monotone" dataKey="cblo" stroke="#06d6e0" strokeWidth={1.5} dot={false} name="CBLO" />
              <Line yAxisId="left" type="monotone" dataKey="repo" stroke="#10b981" strokeWidth={1.5} dot={false} name="Repo" />
              <Bar yAxisId="right" dataKey="spread" fill="rgba(245,158,11,0.15)" radius={[2, 2, 0, 0]} name="MIBOR-Repo Spread (bps)" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Bank Accounts */}
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

      {/* Payment Streams */}
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
};

/* ═══════════════════════════════════════════════════════════
   SECTION 5: TAB — AI ENGINE
   ═══════════════════════════════════════════════════════════ */

const TabAIEngine = ({ clockData, cashFlowHistory }) => {
  const [mcPaths] = useState(() => generateMonteCarloSims());
  const mcFlat = mcPaths.flat();
  const laR_95 = 18.5;
  const laR_99 = 32.1;

  const gapHours = clockData.filter(h => h.predicted < h.min_buffer);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Model Status */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <StatBox label="Model Architecture" value="LSTM" sub="3-layer, 128 hidden units" color="var(--purple)" icon={Brain} />
        <StatBox label="Last Retrained" value="06:00" sub="Today • 90-day window" color="var(--cyan)" icon={RefreshCw} />
        <StatBox label="Forecast MAPE" value="3.8%" sub="7-day rolling average" color="var(--green)" icon={Target} />
        <StatBox label="Features Used" value="47" sub="Cash flows + rates + seasonality" color="var(--amber)" icon={Database} />
        <StatBox label="Confidence" value="96.2%" sub="95% CI within ±₹15Cr" color="var(--teal)" icon={CheckCircle} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 18 }}>
        {/* Monte Carlo Simulation */}
        <div className="card card-glow">
          <SectionTitle icon={GitBranch} title="Monte Carlo Simulation — Liquidity at Risk" subtitle={`${MONTE_CARLO_PATHS.toLocaleString()} simulation paths • 24-hour horizon • Geometric Brownian Motion`} color="var(--purple)" badge="LaR" />
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 6" stroke="rgba(30,37,64,0.5)" />
              <XAxis dataKey="hour" tick={{ fill: "#475569", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={{ stroke: "#1a2540" }} tickLine={false} label={{ value: "Hours", position: "insideBottom", offset: -5, fill: "#475569", fontSize: 9 }} />
              <YAxis tick={{ fill: "#475569", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}Cr`} />
              <Tooltip content={<Tt />} />
              <ReferenceLine y={120} stroke="#ef444466" strokeDasharray="6 3" label={{ value: "Min Buffer", fill: "#ef4444", fontSize: 9 }} />
              <Scatter data={mcFlat.filter((_, i) => i % 3 === 0)} fill="rgba(167,139,250,0.08)" name="₹ Sim Path" />
            </ScatterChart>
          </ResponsiveContainer>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 14 }}>
            <StatBox label="LaR (95%)" value={`₹${laR_95}Cr`} color="var(--amber)" small />
            <StatBox label="LaR (99%)" value={`₹${laR_99}Cr`} color="var(--red)" small />
            <StatBox label="Expected Shortfall" value="₹24.3Cr" color="var(--orange)" small />
            <StatBox label="Breach Probability" value="4.2%" color="var(--red)" small />
          </div>
        </div>

        {/* Gap Detection */}
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
                  <div style={{ marginTop: 8, fontSize: 11, color: "var(--amber)" }}>⚡ Suggested: Borrow ₹{(g.min_buffer - g.predicted + 10).toFixed(0)}Cr via CBLO</div>
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
        {/* Cash Flow History */}
        <div className="card">
          <SectionTitle icon={BarChart3} title="90-Day Cash Flow History" subtitle="Training data for LSTM model • Payroll, GST, Advance Tax markers" color="var(--cyan)" />
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={cashFlowHistory}>
              <CartesianGrid strokeDasharray="3 6" stroke="rgba(30,37,64,0.5)" />
              <XAxis dataKey="label" tick={false} axisLine={{ stroke: "#1a2540" }} />
              <YAxis tick={{ fill: "#475569", fontSize: 9, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}Cr`} />
              <Tooltip content={<Tt />} />
              <Bar dataKey="inflow" fill="rgba(16,185,129,0.25)" radius={[2, 2, 0, 0]} name="₹ Inflow" />
              <Bar dataKey="outflow" fill="rgba(239,68,68,0.2)" radius={[2, 2, 0, 0]} name="₹ Outflow" />
              <Line type="monotone" dataKey="net" stroke="#06d6e0" strokeWidth={1.5} dot={false} name="₹ Net" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* ERP Integration — Payables & Receivables */}
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

      {/* Upcoming Events */}
      <div className="card">
        <SectionTitle icon={Calendar} title="Upcoming Cash Flow Events" subtitle="Payroll, GST, Advance Tax, Bond Coupons — auto-detected from ERP" color="var(--amber)" />
        <div style={{ display: "flex", gap: 14 }}>
          {ERP_DATA.upcoming.map((ev, i) => {
            const Icon = ev.icon;
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
};

/* ═══════════════════════════════════════════════════════════
   SECTION 6: TAB — OPTIMIZER
   ═══════════════════════════════════════════════════════════ */

const TabOptimizer = ({ rates }) => {
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
  ].map(i => ({ ...i, score: +(i.yield * i.liquidity * i.safety).toFixed(3) })).sort((a, b) => b.score - a.score);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <StatBox label="MIBOR-Repo Spread" value={`${spread}bps`} sub={arbitrageActive ? "⚡ Arbitrage threshold exceeded" : "Within normal range"} color={arbitrageActive ? "var(--amber)" : "var(--text-2)"} icon={Crosshair} />
        <StatBox label="Objective Function" value="Max Yield" sub="Yield × Liquidity × Safety" color="var(--purple)" icon={Target} />
        <StatBox label="Active Constraints" value="12" sub="SEBI + RBI + Counterparty limits" color="var(--blue)" icon={Lock} />
        <StatBox label="Last Optimization" value="12s ago" sub="Runs every 30 seconds" color="var(--green)" icon={RefreshCw} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {/* Instrument Ranking */}
        <div className="card card-glow">
          <SectionTitle icon={BarChart3} title="AI Instrument Ranking" subtitle="Score = Yield × Liquidity_Score × Safety_Score" color="var(--cyan)" badge="LIVE" />
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

        {/* Arbitrage Detection */}
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
            <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>Threshold: 25bps {arbitrageActive && "• ⚡ EXCEEDED"}</div>
            {arbitrageActive && (
              <div style={{ marginTop: 12, padding: 10, background: "rgba(245,158,11,0.08)", borderRadius: 6 }}>
                <p style={{ fontSize: 12, color: "var(--amber)", fontWeight: 600 }}>💡 Strategy: Borrow in Repo @ {rates.repo.toFixed(2)}% → Lend in Call Money @ {rates.mibor_overnight.toFixed(2)}%</p>
                <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>Estimated P&L on ₹100Cr: ₹{(spread * 100 / 365).toFixed(0)}K/day</p>
              </div>
            )}
          </div>

          {/* Constraints Summary */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", marginBottom: 8, textTransform: "uppercase" }}>Active Constraints</div>
            {[
              { rule: "Min current account balance", value: "₹50Cr (AI-calculated)", status: "active" },
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

      {/* Current Portfolio Allocation */}
      <div className="card">
        <SectionTitle icon={PieIcon} title="Current Portfolio Allocation" subtitle="Live deployment across all money market instruments" color="var(--purple)" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 10 }}>
          {DEPLOYMENT_PORTFOLIO.map((d, i) => (
            <div key={i} style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12, textAlign: "center", borderTop: `3px solid ${d.color}` }}>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginBottom: 6, fontWeight: 500 }}>{d.instrument}</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: d.color }}>₹{d.amount}Cr</div>
              <div className="mono" style={{ fontSize: 10, color: "var(--text-4)", marginTop: 2 }}>{d.pct}%</div>
              <div style={{ marginTop: 6, fontSize: 10 }}>
                <span style={{ color: "var(--green)" }}>{d.rate}%</span>
                <span style={{ color: "var(--text-4)" }}> • {d.maturity}</span>
              </div>
              <div style={{ fontSize: 9, color: "var(--text-4)", marginTop: 2 }}>{d.settlement} • {d.risk}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   SECTION 7: TAB — EXECUTION
   ═══════════════════════════════════════════════════════════ */

const TabExecution = ({ rates, backend, onExecuteDeployment, onExportOrderBook, onRefreshTelemetry }) => {
  const [deploying, setDeploying] = useState(false);
  const [deployed, setDeployed] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const [message, setMessage] = useState("");
  const surplus = 50;

  const suggestedAlloc = useMemo(() => ([
    { instrument: "CBLO", amount: 20, rate: rates.cblo_bid, platform: "CCIL", reason: "Highest risk-adjusted score, T+0, G-Sec collateral", splits: [{ cp: "SBI", amt: 10 }, { cp: "ICICI", amt: 10 }] },
    { instrument: "Call Money", amount: 15, rate: rates.mibor_overnight, platform: "NDS-Call", reason: "Best yield, strong liquidity depth", splits: [{ cp: "ICICI", amt: 8 }, { cp: "Axis", amt: 7 }] },
    { instrument: "O/N Repo", amount: 10, rate: rates.repo, platform: "NDS-OM", reason: "Sovereign collateralized deployment", splits: [{ cp: "CCIL Triparty", amt: 10 }] },
    { instrument: "Liquid MMF", amount: 5, rate: rates.mmf_liquid, platform: "CAMS", reason: "Instant redemption for intraday buffers", splits: [{ cp: "HDFC Liquid", amt: 3 }, { cp: "SBI Liquid", amt: 2 }] },
  ]), [rates.cblo_bid, rates.mibor_overnight, rates.repo, rates.mmf_liquid]);

  const preTradeCheck = useMemo(
    () => validateDeploymentPlan(suggestedAlloc, surplus, backend.killSwitch),
    [suggestedAlloc, surplus, backend.killSwitch]
  );

  const projectedLoads = useMemo(() => {
    const totals = {};
    suggestedAlloc.forEach((leg) => {
      leg.splits.forEach((split) => {
        const cp = resolveCounterparty(split.cp);
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
  }, [deploying, onExecuteDeployment, suggestedAlloc, surplus]);

  const canDeploy = !deploying && !backend.circuitOpen && preTradeCheck.errors.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Deployment Card */}
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

      {/* Order Book */}
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

      {/* Counterparty Directory */}
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
};

/* ═══════════════════════════════════════════════════════════
   SECTION 8: TAB — RISK & COMPLIANCE
   ═══════════════════════════════════════════════════════════ */

const TabRisk = ({ backend, onExportAuditTrail }) => {
  const compliancePasses = COMPLIANCE_ITEMS.filter((item) => item.status === "pass").length;
  const complianceScore = Math.max(90, 100 - (backend.circuitOpen ? 3.5 : 0) - backend.failedTx24h * 0.05);
  const var99 = +(18.5 + backend.failedTx24h * 0.12 + (backend.circuitOpen ? 1.5 : 0)).toFixed(1);
  const expectedShortfall = +(var99 * 1.31).toFixed(1);
  const concentrationRisk = +(((COUNTERPARTIES.slice(0, 3).reduce((sum, cp) => sum + cp.exposure, 0) / COUNTERPARTIES.reduce((sum, cp) => sum + cp.exposure, 0)) * 100)).toFixed(1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <StatBox label="Portfolio VaR (99%)" value={`₹${var99}Cr`} sub="Dynamic with backend incidents" color="var(--red)" icon={Gauge} />
        <StatBox label="Expected Shortfall" value={`₹${expectedShortfall}Cr`} sub="Tail risk measure" color="var(--orange)" icon={AlertTriangle} />
        <StatBox label="Max Drawdown" value={`₹${(6.2 + backend.failedTx24h * 0.02).toFixed(1)}Cr`} sub="30-day rolling" color="var(--amber)" icon={TrendingDown} />
        <StatBox label="Concentration Risk" value={`${concentrationRisk}%`} sub="Top 3 counterparties" color="var(--purple)" icon={Users} />
        <StatBox label="Compliance Score" value={`${complianceScore.toFixed(1)}%`} sub={`${compliancePasses}/13 base checks + runtime controls`} color={complianceScore > 97 ? "var(--green)" : "var(--amber)"} icon={ShieldCheck} />
      </div>

      {/* Instrument Exposure */}
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
        {/* Stress Testing */}
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
                <div style={{ marginTop: 6, fontSize: 10, color: "var(--teal)" }}>🛡 {s.mitigation}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Compliance Dashboard */}
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

      {/* Audit Trail */}
      <div className="card">
        <SectionTitle icon={Lock} title="Immutable Audit Trail" subtitle="Tamper-evident logs for decisions, executions, and safeguards" color="var(--blue)" right={<button className="btn-ghost" onClick={onExportAuditTrail}><Download size={12} /> Export for Regulator</button>} />
        <div className="scrollbar-thin" style={{ maxHeight: 220, overflowY: "auto" }}>
          {backend.auditTrail.map((log) => (
            <div key={log.id} className="table-row" style={{ gridTemplateColumns: "0.8fr 1fr 3fr 1.2fr 1fr", display: "grid" }}>
              <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{log.time}</span>
              <span className="badge mono" style={{ background: "var(--bg-1)", color: log.level === "error" ? "var(--red)" : log.level === "warn" ? "var(--amber)" : "var(--cyan)", justifySelf: "start" }}>{log.action}</span>
              <span style={{ fontSize: 11, color: "var(--text-2)" }}>{log.detail}</span>
              <span style={{ fontSize: 10, color: "var(--text-3)" }}>{log.user}</span>
              <span className="mono" style={{ fontSize: 9, color: "var(--text-4)" }}>🔒 {log.hash}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   SECTION 9: TAB — INSTRUMENTS
   ═══════════════════════════════════════════════════════════ */

const TabInstruments = ({ rates }) => {
  const [calcTab, setCalcTab] = useState("ois");

  // OIS Calculator
  const oisNotional = 100;
  const oisFixedRate = rates.ois_1y;
  const oisFloatingRate = rates.mibor_overnight;
  const oisPnL = +((oisFloatingRate - oisFixedRate) * oisNotional / 100).toFixed(3);

  // FRA Calculator
  const fraNotional = 50;
  const fraRate = rates.mifor_3m;
  const fraSettlement = rates.mibor_3m;
  const fraPnL = +((fraSettlement - fraRate) * fraNotional / 100 * 0.25).toFixed(3);

  // MIFOR Calculator
  const miforCalc = +(rates.sofr + ((rates.usdinr_1m_fwd - rates.usdinr_spot) / rates.usdinr_spot) * 1200).toFixed(4);

  // CD Interpolation
  const cdPoints = [
    { tenor: "1M", rate: rates.cd_1m, days: 30 },
    { tenor: "3M", rate: rates.cd_3m, days: 90 },
    { tenor: "6M", rate: rates.cd_6m, days: 180 },
    { tenor: "12M", rate: rates.cd_12m, days: 365 },
  ];
  const cd2m = +((rates.cd_1m + rates.cd_3m) / 2).toFixed(2);
  const cd9m = +((rates.cd_6m + rates.cd_12m) / 2).toFixed(2);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Rate Matrix */}
      <div className="card card-glow">
        <SectionTitle icon={Globe} title="Complete Rate Matrix" subtitle="All money market instrument rates — live from FBIL, CCIL, FIMMDA, NDS-OM" color="var(--cyan)" badge="LIVE" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { category: "MIBOR (FBIL)", items: [{ l: "Overnight", v: rates.mibor_overnight }, { l: "14-Day", v: rates.mibor_14d }, { l: "1-Month", v: rates.mibor_1m }, { l: "3-Month", v: rates.mibor_3m }] },
            { category: "Secured (CCIL/NDS)", items: [{ l: "CBLO Bid", v: rates.cblo_bid }, { l: "CBLO Ask", v: rates.cblo_ask }, { l: "Repo", v: rates.repo }, { l: "Reverse Repo", v: rates.reverse_repo }] },
            { category: "CD / CP (FIMMDA)", items: [{ l: "CD 1M", v: rates.cd_1m }, { l: "CD 3M", v: rates.cd_3m }, { l: "CD 6M", v: rates.cd_6m }, { l: "CP 3M", v: rates.cp_3m }] },
            { category: "T-Bills (NDS-OM)", items: [{ l: "91-Day", v: rates.tbill_91d }, { l: "182-Day", v: rates.tbill_182d }, { l: "364-Day", v: rates.tbill_364d }, { l: "G-Sec 10Y", v: rates.gsec_10y }] },
            { category: "MIFOR (Cross-Ccy)", items: [{ l: "1-Month", v: rates.mifor_1m }, { l: "3-Month", v: rates.mifor_3m }, { l: "6-Month", v: rates.mifor_6m }, { l: "Calculated", v: miforCalc }] },
            { category: "OIS (Swap)", items: [{ l: "1-Year", v: rates.ois_1y }, { l: "3-Year", v: rates.ois_3y }, { l: "5-Year", v: rates.ois_5y }, { l: "SOFR", v: rates.sofr }] },
            { category: "Call & Notice", items: [{ l: "Call High", v: rates.call_money_high }, { l: "Call Low", v: rates.call_money_low }, { l: "Notice 7D", v: rates.notice_7d }, { l: "Notice 14D", v: rates.notice_14d }] },
            { category: "MMF / FX", items: [{ l: "Liquid Fund", v: rates.mmf_liquid }, { l: "O/N Fund", v: rates.mmf_overnight }, { l: "USD/INR Spot", v: rates.usdinr_spot }, { l: "USD/INR 1M Fwd", v: rates.usdinr_1m_fwd }] },
          ].map((group, i) => (
            <div key={i} style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>{group.category}</div>
              {group.items.map((item, j) => (
                <div key={j} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: j < 3 ? "1px solid var(--border-1)" : "none" }}>
                  <span style={{ fontSize: 11, color: "var(--text-2)" }}>{item.l}</span>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: "var(--cyan)" }}>{item.v.toFixed(item.l.includes("USD") ? 2 : 2)}{ item.l.includes("USD") ? "" : "%" }</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Instrument Calculators */}
      <div style={{ display: "flex", gap: 8, marginBottom: -10 }}>
        {[
          { id: "ois", label: "OIS Pricing", icon: Scale },
          { id: "fra", label: "FRA Settlement", icon: Compass },
          { id: "mifor", label: "MIFOR Derivation", icon: Globe },
          { id: "cd", label: "CD Curve Interpolation", icon: Activity },
          { id: "notice", label: "Notice Money", icon: Timer },
          { id: "cross", label: "Cross-Currency", icon: Navigation },
        ].map(t => (
          <button key={t.id} className={`tab-btn ${calcTab === t.id ? "active" : ""}`} onClick={() => setCalcTab(t.id)}>
            <t.icon size={12} /> {t.label}
          </button>
        ))}
      </div>

      <div className="card">
        {calcTab === "ois" && (
          <>
            <SectionTitle icon={Scale} title="OIS (Overnight Index Swap) Pricing" subtitle="MIBOR-linked OIS settlement calculation" color="var(--purple)" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
              <StatBox label="Notional" value={`₹${oisNotional}Cr`} small />
              <StatBox label="Fixed Leg" value={`${oisFixedRate.toFixed(2)}%`} sub="OIS 1Y Rate" color="var(--purple)" small />
              <StatBox label="Floating Leg" value={`${oisFloatingRate.toFixed(2)}%`} sub="MIBOR O/N Compounded" color="var(--cyan)" small />
              <StatBox label="Net Settlement" value={`₹${Math.abs(oisPnL).toFixed(2)}Cr`} sub={oisPnL >= 0 ? "Receive floating" : "Pay floating"} color={oisPnL >= 0 ? "var(--green)" : "var(--red)"} small />
              <StatBox label="DV01" value="₹4.2L" sub="Per 1bp move in MIBOR" color="var(--amber)" small />
            </div>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14 }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 2 }}>
                <span style={{ color: "var(--text-4)" }}>Settlement Formula:</span><br />
                <span style={{ color: "var(--cyan)" }}>Net = Notional × (Floating_Compound - Fixed) × DayCount/365</span><br />
                <span style={{ color: "var(--text-4)" }}>Where Floating_Compound = Π(1 + MIBOR_i/365) - 1 over the swap tenor</span><br />
                <span style={{ color: "var(--text-4)" }}>Cleared through CCIL • Daily margin via SPAN methodology</span>
              </div>
            </div>
          </>
        )}
        {calcTab === "fra" && (
          <>
            <SectionTitle icon={Compass} title="FRA (Forward Rate Agreement) Calculator" subtitle="MIFOR-based FRA booking and settlement rate calculation" color="var(--amber)" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
              <StatBox label="Notional" value={`₹${fraNotional}Cr`} small />
              <StatBox label="FRA Rate" value={`${fraRate.toFixed(2)}%`} sub="MIFOR 3M" color="var(--amber)" small />
              <StatBox label="Settlement Rate" value={`${fraSettlement.toFixed(2)}%`} sub="MIBOR 3M at expiry" color="var(--cyan)" small />
              <StatBox label="Settlement Amount" value={`₹${Math.abs(fraPnL).toFixed(2)}Cr`} sub={fraPnL >= 0 ? "Receive" : "Pay"} color={fraPnL >= 0 ? "var(--green)" : "var(--red)"} small />
              <StatBox label="Tenor" value="3M × 6M" sub="3-month forward, 6-month reference" color="var(--purple)" small />
            </div>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14 }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 2 }}>
                <span style={{ color: "var(--text-4)" }}>Settlement Formula:</span><br />
                <span style={{ color: "var(--cyan)" }}>PV = Notional × (Settlement_Rate - FRA_Rate) × Period / (1 + Settlement_Rate × Period)</span><br />
                <span style={{ color: "var(--text-4)" }}>Settlement Reference: FBIL MIBOR fixing at 10:45 AM IST</span>
              </div>
            </div>
          </>
        )}
        {calcTab === "mifor" && (
          <>
            <SectionTitle icon={Globe} title="MIFOR Derivation Engine" subtitle="USD/INR forward premium + SOFR = Implied INR forward rate" color="var(--teal)" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
              <StatBox label="SOFR" value={`${rates.sofr.toFixed(2)}%`} sub="USD overnight rate" color="var(--blue)" small />
              <StatBox label="USD/INR Spot" value={rates.usdinr_spot.toFixed(2)} sub="RBI reference rate" color="var(--text-1)" small />
              <StatBox label="1M Forward" value={rates.usdinr_1m_fwd.toFixed(2)} sub="Forward points: +23p" color="var(--amber)" small />
              <StatBox label="Forward Premium" value={`${(((rates.usdinr_1m_fwd - rates.usdinr_spot) / rates.usdinr_spot) * 1200).toFixed(2)}%`} sub="Annualized" color="var(--purple)" small />
              <StatBox label="MIFOR 1M" value={`${miforCalc.toFixed(2)}%`} sub="Derived rate" color="var(--cyan)" small />
            </div>
            <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14 }}>
              <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 2 }}>
                <span style={{ color: "var(--text-4)" }}>MIFOR Formula:</span><br />
                <span style={{ color: "var(--cyan)" }}>MIFOR = SOFR + Forward_Premium = SOFR + ((Fwd - Spot) / Spot) × (12/Tenor_Months) × 100</span><br />
                <span style={{ color: "var(--text-4)" }}>Used for: Importer/Exporter hedge pricing, Cross-currency swap valuation</span><br />
                <span style={{ color: "var(--text-4)" }}>Published by: FBIL (Financial Benchmarks India Ltd)</span>
              </div>
            </div>
          </>
        )}
        {calcTab === "cd" && (
          <>
            <SectionTitle icon={Activity} title="CD Yield Curve Interpolation" subtitle="FIMMDA secondary market data with fallback logic for insufficient trades" color="var(--pink)" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 16 }}>
              {cdPoints.map((pt, i) => (
                <StatBox key={i} label={`CD ${pt.tenor}`} value={`${pt.rate.toFixed(2)}%`} sub={`${pt.days} days`} color="var(--pink)" small />
              ))}
              <StatBox label="CD 2M (Interp)" value={`${cd2m}%`} sub="Linear interpolation" color="var(--amber)" small />
              <StatBox label="CD 9M (Interp)" value={`${cd9m}%`} sub="Linear interpolation" color="var(--amber)" small />
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={[...cdPoints, { tenor: "2M*", rate: cd2m, days: 60 }, { tenor: "9M*", rate: cd9m, days: 270 }].sort((a, b) => a.days - b.days)}>
                <CartesianGrid strokeDasharray="3 6" stroke="rgba(30,37,64,0.5)" />
                <XAxis dataKey="tenor" tick={{ fill: "#475569", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={{ stroke: "#1a2540" }} tickLine={false} />
                <YAxis tick={{ fill: "#475569", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} domain={["auto", "auto"]} tickFormatter={v => `${v}%`} />
                <Tooltip content={<Tt />} />
                <Line type="monotone" dataKey="rate" stroke="var(--pink)" strokeWidth={2} dot={{ r: 4, fill: "var(--pink)" }} name="Rate" />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 8, background: "var(--bg-1)", borderRadius: 8, padding: 12 }}>
              <div className="mono" style={{ fontSize: 10, color: "var(--text-4)", lineHeight: 1.8 }}>
                Fallback Logic: If FIMMDA has &lt;3 trades for a tenor → Use previous day's rate + MIBOR trend adjustment<br />
                Interpolation: Linear between nearest observed tenors • Nelson-Siegel for full curve fitting
              </div>
            </div>
          </>
        )}
        {calcTab === "notice" && (
          <>
            <SectionTitle icon={Timer} title="Notice Money Management" subtitle="7-day and 14-day booking with automated notice period reminders" color="var(--orange)" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              <StatBox label="7-Day Notice Rate" value={`${rates.notice_7d.toFixed(2)}%`} color="var(--orange)" small />
              <StatBox label="14-Day Notice Rate" value={`${rates.notice_14d.toFixed(2)}%`} color="var(--orange)" small />
              <StatBox label="Active 7D Positions" value="₹12Cr" sub="Notice due: Mar 2" color="var(--cyan)" small />
              <StatBox label="Active 14D Positions" value="₹0Cr" sub="None outstanding" color="var(--text-3)" small />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>7-Day Notice Lifecycle</div>
                {["Day 0: Placement at agreed rate", "Day 1-5: Accruing interest", "Day 5: ⚠️ Notice period reminder (2 days before)", "Day 6: Notice sent to counterparty", "Day 7: Principal + Interest settlement"].map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0", fontSize: 11, color: i === 2 ? "var(--amber)" : "var(--text-2)" }}>
                    <span style={{ color: "var(--text-4)" }}>{i + 1}.</span> {step}
                  </div>
                ))}
              </div>
              <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Auto-Reminder Schedule</div>
                {[
                  { label: "2 days before notice", action: "Email + dashboard alert to Treasurer" },
                  { label: "1 day before notice", action: "Confirm recall or extend with counterparty" },
                  { label: "Notice day", action: "Auto-send notice via NDS-Call if pre-approved" },
                  { label: "Settlement day", action: "Verify principal + interest credited" },
                ].map((r, i) => (
                  <div key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--border-1)" }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: "var(--text-1)" }}>{r.label}</div>
                    <div style={{ fontSize: 10, color: "var(--text-3)" }}>{r.action}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {calcTab === "cross" && (
          <>
            <SectionTitle icon={Navigation} title="Cross-Currency Module" subtitle="MIFOR-based hedging for importers/exporters • USD/INR forward + SOFR integration" color="var(--blue)" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
              <StatBox label="USD/INR Spot" value={rates.usdinr_spot.toFixed(2)} color="var(--text-1)" small />
              <StatBox label="1M Forward" value={rates.usdinr_1m_fwd.toFixed(2)} sub={`+${((rates.usdinr_1m_fwd - rates.usdinr_spot) * 100).toFixed(0)} paise`} color="var(--amber)" small />
              <StatBox label="SOFR (USD)" value={`${rates.sofr.toFixed(2)}%`} color="var(--blue)" small />
              <StatBox label="MIFOR 1M" value={`${rates.mifor_1m.toFixed(2)}%`} color="var(--cyan)" small />
              <StatBox label="Hedge Cost" value={`${(rates.mifor_1m - rates.mibor_1m).toFixed(2)}%`} sub="MIFOR - MIBOR spread" color="var(--purple)" small />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Importer Hedge (USD Payable)</div>
                <div style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.8 }}>
                  Payable: $10M due in 1 month<br />
                  Forward Rate: ₹{rates.usdinr_1m_fwd.toFixed(2)}/$<br />
                  Locked Cost: ₹{(rates.usdinr_1m_fwd * 10).toFixed(1)}Cr<br />
                  vs Spot: ₹{(rates.usdinr_spot * 10).toFixed(1)}Cr<br />
                  <span style={{ color: "var(--amber)" }}>Premium: ₹{((rates.usdinr_1m_fwd - rates.usdinr_spot) * 10).toFixed(2)}Cr</span>
                </div>
              </div>
              <div style={{ background: "var(--bg-1)", borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Exporter Hedge (USD Receivable)</div>
                <div style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.8 }}>
                  Receivable: $5M due in 3 months<br />
                  MIFOR 3M: {rates.mifor_3m.toFixed(2)}%<br />
                  FRA suggestion: Lock at {rates.mifor_3m.toFixed(2)}% for 3M<br />
                  Hedge: Sell USD forward + enter receive-MIFOR FRA<br />
                  <span style={{ color: "var(--green)" }}>Net INR yield enhancement: ~{(rates.mifor_3m - rates.mibor_3m).toFixed(2)}%</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   SECTION 10: TAB — ANALYTICS
   ═══════════════════════════════════════════════════════════ */

const TabAnalytics = () => {
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
            <YAxis tick={{ fill: "#475569", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}bps`} />
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
            <YAxis tick={{ fill: "#475569", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} domain={[0, 10]} />
            <Tooltip content={<Tt />} />
            <Area type="monotone" dataKey="mape" stroke="#a78bfa" strokeWidth={2} fill="url(#gMape)" name="MAPE" />
            <ReferenceLine y={5} stroke="#f59e0b66" strokeDasharray="6 3" label={{ value: "Target 5%", fill: "#f59e0b", fontSize: 9 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>

    {/* Operational Summary */}
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
};

/* ═══════════════════════════════════════════════════════════
   SECTION 11: TAB — SETTINGS & SECURITY
   ═══════════════════════════════════════════════════════════ */

const TabSettings = ({ backend, onToggleKillSwitch, onToggleFailover, onResetCircuit }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
    {/* Backend Controls */}
    <div className="card card-glow">
      <SectionTitle icon={Server} title="Backend Runtime Controls" subtitle="High-availability controls for execution and failover behavior" color="var(--cyan)" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        <StatBox label="Circuit Breaker" value={backend.circuitOpen ? "OPEN" : "CLOSED"} sub={backend.circuitOpenedAt ? `Opened at ${backend.circuitOpenedAt}` : "Healthy"} color={backend.circuitOpen ? "var(--red)" : "var(--green)"} icon={Shield} small />
        <StatBox label="Queue Depth" value={`${backend.queueDepth}`} sub="Execution messages pending" color={backend.queueDepth > 20 ? "var(--amber)" : "var(--cyan)"} icon={Layers} small />
        <StatBox label="Throughput" value={`${backend.throughputPerMin}/min`} sub="Settlements + orders" color="var(--blue)" icon={Activity} small />
        <StatBox label="P99 Latency" value={`${backend.apiLatencyP99.toFixed(0)}ms`} sub={`${backend.failoverMode.toUpperCase()} failover`} color={backend.apiLatencyP99 > 45 ? "var(--amber)" : "var(--green)"} icon={Clock} small />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn-ghost" onClick={onToggleKillSwitch}>
          {backend.killSwitch ? <Unlock size={12} /> : <Lock size={12} />} {backend.killSwitch ? "Disable" : "Enable"} Kill Switch
        </button>
        <button className="btn-ghost" onClick={onToggleFailover}>
          <Server size={12} /> Switch to {backend.failoverMode === "auto" ? "Manual" : "Auto"} Failover
        </button>
        <button className="btn-ghost" onClick={onResetCircuit} disabled={!backend.circuitOpen}>
          <RotateCcw size={12} /> Reset Circuit
        </button>
      </div>
    </div>

    {/* Access Control */}
    <div className="card">
      <SectionTitle icon={Key} title="Role-Based Access Control" subtitle="2FA enforced for all roles • End-to-end encryption on all data channels" color="var(--amber)" />
      <div>
        {ACCESS_ROLES.map((role, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr 2.5fr 0.8fr 0.6fr", padding: "12px 14px", borderBottom: "1px solid var(--border-1)", alignItems: "center" }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{role.role}</span>
              <div className="badge mono" style={{ background: "var(--bg-1)", color: "var(--text-3)", marginTop: 4, display: "inline-block" }}>{role.level}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {role.users.map((u, j) => (
                <span key={j} style={{ background: "var(--bg-3)", borderRadius: 4, padding: "3px 8px", fontSize: 11, color: "var(--text-2)" }}>{u}</span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {role.permissions.map((p, j) => (
                <span key={j} className="badge" style={{ background: "var(--bg-1)", color: "var(--text-3)" }}>{p}</span>
              ))}
            </div>
            <span style={{ fontSize: 11 }}>{role.twoFA ? <span style={{ color: "var(--green)", display: "flex", alignItems: "center", gap: 4 }}><Lock size={11} /> 2FA</span> : <span style={{ color: "var(--red)" }}>No 2FA</span>}</span>
            <button className="btn-ghost" style={{ padding: "4px 8px" }}><Settings size={11} /></button>
          </div>
        ))}
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      {/* Security Configuration */}
      <div className="card">
        <SectionTitle icon={Lock} title="Security Configuration" subtitle="Encryption, data residency, and audit settings" color="var(--red)" />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { label: "Data Encryption", value: "AES-256 (at-rest) + TLS 1.3 (in-transit)", status: "active" },
            { label: "Data Residency", value: "AWS Mumbai (ap-south-1) — RBI compliant", status: "active" },
            { label: "API Authentication", value: "OAuth 2.0 + mTLS for bank integrations", status: "active" },
            { label: "Session Timeout", value: "15 minutes idle, 8 hours max", status: "active" },
            { label: "IP Whitelisting", value: "Enabled — 12 IPs authorized", status: "active" },
            { label: "HSM Integration", value: "AWS CloudHSM for signing keys", status: "active" },
            { label: "Audit Log Retention", value: "7 years (immutable, append-only)", status: "active" },
            { label: "Penetration Testing", value: "Last: Jan 15, 2026 — 0 critical findings", status: "active" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-1)" }}>
              <span style={{ fontSize: 12, color: "var(--text-1)" }}>{item.label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>{item.value}</span>
                <span className="status-dot live" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* System Integration Status */}
      <div className="card">
        <SectionTitle icon={Server} title="System Integrations" subtitle="API connectivity and health status for all external systems" color="var(--blue)" />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {backend.integrations.map((sys, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 0.8fr 0.8fr", padding: "6px 0", borderBottom: "1px solid var(--border-1)", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--text-1)", fontWeight: 500 }}>{sys.system}</span>
              <span style={{ fontSize: 10, color: sys.status === "Degraded" ? "var(--amber)" : sys.status === "Down" ? "var(--red)" : "var(--green)", display: "flex", alignItems: "center", gap: 4 }}><span className={`status-dot ${sys.status === "Down" ? "error" : sys.status === "Degraded" ? "warn" : "live"}`} />{sys.status}</span>
              <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{formatLatency(sys.latency)}</span>
              <span className="mono" style={{ fontSize: 10, color: sys.uptime < 99.8 ? "var(--amber)" : "var(--green)" }}>{formatUptime(sys.uptime)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Tech Stack */}
    <div className="card">
      <SectionTitle icon={Cpu} title="Technical Architecture" subtitle="Production deployment specifications" color="var(--purple)" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { layer: "Frontend", tech: "React.js + WebSocket", detail: "Real-time data via WS, Recharts for viz" },
          { layer: "ML Backend", tech: "Python (FastAPI)", detail: "LSTM/Transformer, MLflow versioning" },
          { layer: "Trading Engine", tech: "Node.js", detail: "Low-latency order routing, event-driven" },
          { layer: "Time-Series DB", tech: "TimescaleDB", detail: "Rate data, tick-by-tick history" },
          { layer: "Transactional DB", tech: "PostgreSQL", detail: "Orders, positions, compliance logs" },
          { layer: "Message Queue", tech: "Apache Kafka", detail: "High-frequency payment stream ingestion" },
          { layer: "ML Pipeline", tech: "Airflow + MLflow", detail: "Daily retrain, model versioning, A/B" },
          { layer: "Deployment", tech: "AWS Mumbai + K8s", detail: "RBI data residency, auto-scaling" },
        ].map((item, i) => (
          <div key={i} style={{ background: "var(--bg-1)", borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 10, color: "var(--text-4)", textTransform: "uppercase", marginBottom: 4 }}>{item.layer}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--purple)", marginBottom: 4 }}>{item.tech}</div>
            <div style={{ fontSize: 10, color: "var(--text-3)" }}>{item.detail}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════
   SECTION 12: MAIN APPLICATION
   ═══════════════════════════════════════════════════════════ */

const TABS = [
  { id: "command", label: "Command Center", icon: Eye },
  { id: "ai", label: "AI Engine", icon: Brain },
  { id: "optimizer", label: "Optimizer", icon: Sliders },
  { id: "execution", label: "Execution", icon: Zap },
  { id: "risk", label: "Risk & Compliance", icon: Shield },
  { id: "instruments", label: "Instruments", icon: Scale },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

export default function LiquiFi() {
  const engineRef = useRef(null);
  if (!engineRef.current) {
    engineRef.current = createBackendEngine(generateRates());
  }

  const [tab, setTab] = useState("command");
  const [backend, setBackend] = useState(() => createBackendState());
  const [rates, setRates] = useState(() => engineRef.current.getSnapshot().rates);
  const [clockData] = useState(() => generateHourlyForecast());
  const [historicalRates] = useState(() => generateHistoricalRates());
  const [cashFlowHistory] = useState(() => generateCashFlowHistory());
  const [time, setTime] = useState(new Date());
  const syncBackendTelemetry = useCallback((opts = {}) => {
    const snapshot = engineRef.current.getSnapshot();
    const queueDepth = snapshot.orderQueue.filter((o) => o.status === "queued" || o.status === "retry").length;
    const processedTx24h = 1248 + snapshot.metrics.processedOrders;
    const failedTx24h = 4 + snapshot.metrics.hardFailures;
    const totalTx = processedTx24h + failedTx24h;
    const successRate = totalTx > 0 ? (processedTx24h / totalTx) * 100 : 100;

    const liveOrders = snapshot.orderQueue.map((order) => ({
      id: order.id,
      time: new Date(order.updatedAt || order.createdAt || Date.now()).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }),
      instrument: order.instrument,
      side: order.side,
      amount: order.amount,
      rate: order.rate,
      counterparty: order.counterparty || "Liquidity Pool",
      platform: order.platform || "Engine",
      status: order.status,
    }));

    const auditFromEngine = snapshot.events.slice(0, 3).map((evt) => createAuditEntry({
      action: (evt.module || "ENGINE").toUpperCase().slice(0, 12),
      detail: evt.message,
      actor: "Backend Engine",
      level: evt.level === "error" ? "error" : evt.level === "warn" ? "warn" : "info",
    }));

    setRates(snapshot.rates);
    setBackend((prev) => ({
      ...prev,
      killSwitch: snapshot.killSwitch,
      circuitOpen: snapshot.metrics.circuitState === "open",
      circuitOpenedAt: snapshot.metrics.circuitOpenedAt ? new Date(snapshot.metrics.circuitOpenedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) : null,
      queueDepth,
      throughputPerMin: Math.max(40, Math.round((snapshot.metrics.processedOrders + snapshot.metrics.retries + queueDepth) * 4)),
      processedTx24h,
      failedTx24h,
      successRate: +successRate.toFixed(2),
      apiLatencyP99: +clamp(18 + queueDepth * 1.8 + (snapshot.metrics.circuitState === "open" ? 35 : 0) + rand(-3, 3), 12, 180).toFixed(1),
      idempotencyKeys: Array.from({ length: Math.min(snapshot.processedKeyCount, 12) }, (_, i) => `idem-${String(i + 1).padStart(3, "0")}`),
      orderBook: [...liveOrders, ...prev.orderBook.filter((old) => !liveOrders.some((curr) => curr.id === old.id))].slice(0, 60),
      paymentStreams: opts.skipPayments ? prev.paymentStreams : [createRealtimePayment(), ...prev.paymentStreams].slice(0, 40),
      integrations: prev.integrations.map((sys) => {
        const baseLatency = sys.latency ?? 8;
        const nextLatency = +clamp(baseLatency + rand(-2, 2) + queueDepth * 0.04, 2, 220).toFixed(1);
        const baseUptime = sys.uptime ?? 99.9;
        const nextUptime = +clamp(baseUptime - rand(0, 0.02), 99.4, 99.99).toFixed(2);
        let status = sys.status;
        if (nextLatency > 120 || nextUptime < 99.5) {
          status = "Down";
        } else if (nextLatency > 65 || snapshot.metrics.circuitState === "half_open") {
          status = "Degraded";
        } else if (snapshot.metrics.circuitState === "open" && /CCIL|NDS-Call|Bank APIs/.test(sys.system)) {
          status = "Degraded";
        } else if (sys.status !== "Healthy") {
          status = "Connected";
        }
        return { ...sys, status, latency: nextLatency, uptime: nextUptime };
      }),
      auditTrail: [...auditFromEngine, ...prev.auditTrail].slice(0, 80),
    }));
  }, []);

  useEffect(() => {
    engineRef.current.hydrate();
    syncBackendTelemetry({ skipPayments: true });
    const interval = setInterval(() => {
      engineRef.current.tick();
      engineRef.current.processQueue();
      syncBackendTelemetry();
      setTime(new Date());
    }, 3000);
    return () => clearInterval(interval);
  }, [syncBackendTelemetry]);

  const handleExecuteDeployment = useCallback(async ({ plan, surplus }) => {
    const preCheck = validateDeploymentPlan(plan, surplus, backend.killSwitch);
    if (!preCheck.valid) {
      return { ok: false, message: preCheck.errors[0] || "Pre-trade validation failed." };
    }
    if (engineRef.current.getSnapshot().metrics.circuitState === "open") {
      return { ok: false, message: "Execution circuit is open. Reset circuit breaker from Settings." };
    }

    await sleep(250);

    let accepted = 0;
    let rejected = 0;
    let firstError = "";
    const requestSignature = plan
      .flatMap((leg) => leg.splits.map((split) => `${leg.instrument}:${split.cp}:${split.amt}:${Number(leg.rate).toFixed(4)}`))
      .sort()
      .join("|");

    plan.forEach((leg, legIndex) => {
      leg.splits.forEach((split, splitIndex) => {
        const idempotencyKey = `${requestSignature}:${legIndex}:${splitIndex}`.replace(/\s+/g, "-").toLowerCase();
        const response = engineRef.current.submitOrder({
          instrument: leg.instrument,
          side: "LEND",
          amount: split.amt,
          rate: leg.rate,
          counterparty: split.cp,
          platform: leg.platform,
          idempotencyKey,
        });
        if (response.ok) {
          accepted += 1;
        } else {
          rejected += 1;
          if (!firstError) firstError = response.error;
        }
      });
    });

    for (let i = 0; i < 3; i++) {
      engineRef.current.processQueue();
      await sleep(120);
    }
    syncBackendTelemetry();

    if (accepted === 0) {
      return { ok: false, message: firstError || "No child orders accepted by backend." };
    }
    if (rejected > 0) {
      return { ok: false, message: `${accepted} child orders queued, ${rejected} rejected (${firstError}).` };
    }
    return { ok: true, message: `Deployment accepted with ${accepted} child orders and replay protection enabled.` };
  }, [backend.killSwitch, syncBackendTelemetry]);

  const handleExportOrderBook = useCallback(() => {
    const safeTs = new Date().toISOString().replace(/[:.]/g, "-");
    exportJsonFile(`liquifi-order-book-${safeTs}.json`, backend.orderBook);
  }, [backend.orderBook]);

  const handleRefreshTelemetry = useCallback(() => {
    engineRef.current.tick();
    engineRef.current.processQueue();
    syncBackendTelemetry();
  }, [syncBackendTelemetry]);

  const handleExportAuditTrail = useCallback(() => {
    const safeTs = new Date().toISOString().replace(/[:.]/g, "-");
    exportJsonFile(`liquifi-audit-trail-${safeTs}.json`, backend.auditTrail);
  }, [backend.auditTrail]);

  const handleToggleKillSwitch = useCallback(() => {
    engineRef.current.setKillSwitch(!backend.killSwitch);
    syncBackendTelemetry({ skipPayments: true });
  }, [backend.killSwitch, syncBackendTelemetry]);

  const handleToggleFailover = useCallback(() => {
    setBackend((prev) => {
      const nextMode = prev.failoverMode === "auto" ? "manual" : "auto";
      return {
        ...prev,
        failoverMode: nextMode,
        auditTrail: [
          createAuditEntry({
            action: "FAILOVER",
            detail: `Failover mode switched to ${nextMode.toUpperCase()}.`,
            actor: "Ops Console",
            level: "warn",
          }),
          ...prev.auditTrail,
        ].slice(0, 80),
      };
    });
  }, []);

  const handleResetCircuit = useCallback(() => {
    engineRef.current.forceRecover();
    syncBackendTelemetry({ skipPayments: true });
  }, [syncBackendTelemetry]);

  const alertCount = useMemo(() => {
    const dynamic = backend.auditTrail.filter((log) => log.level === "warn" || log.level === "error").length;
    return Math.min(99, ALERTS_FULL.length + dynamic);
  }, [backend.auditTrail]);

  const prevRatesRef = useRef(rates);
  const rateItems = useMemo(() => {
    const prev = prevRatesRef.current || rates;
    const items = [
      { name: "MIBOR O/N", rate: rates.mibor_overnight, ch: +((rates.mibor_overnight - prev.mibor_overnight) * 100).toFixed(1) },
      { name: "MIBOR 14D", rate: rates.mibor_14d, ch: +((rates.mibor_14d - prev.mibor_14d) * 100).toFixed(1) },
      { name: "MIBOR 1M", rate: rates.mibor_1m, ch: +((rates.mibor_1m - prev.mibor_1m) * 100).toFixed(1) },
      { name: "MIBOR 3M", rate: rates.mibor_3m, ch: +((rates.mibor_3m - prev.mibor_3m) * 100).toFixed(1) },
      { name: "CBLO Bid", rate: rates.cblo_bid, ch: +((rates.cblo_bid - prev.cblo_bid) * 100).toFixed(1) },
      { name: "CBLO Ask", rate: rates.cblo_ask, ch: +((rates.cblo_ask - prev.cblo_ask) * 100).toFixed(1) },
      { name: "Repo", rate: rates.repo, ch: +((rates.repo - prev.repo) * 100).toFixed(1) },
      { name: "CD 3M", rate: rates.cd_3m, ch: +((rates.cd_3m - prev.cd_3m) * 100).toFixed(1) },
      { name: "T-Bill 91D", rate: rates.tbill_91d, ch: +((rates.tbill_91d - prev.tbill_91d) * 100).toFixed(1) },
      { name: "MIFOR 1M", rate: rates.mifor_1m, ch: +((rates.mifor_1m - prev.mifor_1m) * 100).toFixed(1) },
      { name: "OIS 1Y", rate: rates.ois_1y, ch: +((rates.ois_1y - prev.ois_1y) * 100).toFixed(1) },
      { name: "G-Sec 10Y", rate: rates.gsec_10y, ch: +((rates.gsec_10y - prev.gsec_10y) * 100).toFixed(1) },
      { name: "USD/INR", rate: rates.usdinr_spot, ch: +((rates.usdinr_spot - prev.usdinr_spot) * 100).toFixed(1), isFx: true },
      { name: "SOFR", rate: rates.sofr, ch: +((rates.sofr - prev.sofr) * 100).toFixed(1) },
      { name: "MMF Liquid", rate: rates.mmf_liquid, ch: +((rates.mmf_liquid - prev.mmf_liquid) * 100).toFixed(1) },
    ];
    prevRatesRef.current = rates;
    return items;
  }, [rates]);

  return (
    <>
      <style>{css}</style>
      <div style={{ minHeight: "100vh", background: "var(--bg-0)", position: "relative" }}>
        <div className="grid-overlay" />

        {/* HEADER */}
        <header style={{ borderBottom: "1px solid var(--border-1)", position: "relative", zIndex: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 56, padding: "0 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: "linear-gradient(135deg, var(--cyan), var(--blue))", display: "flex", alignItems: "center", justifyContent: "center", animation: "breathe 3s ease-in-out infinite" }}>
                <DollarSign size={16} color="white" strokeWidth={2.5} />
              </div>
              <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text-0)" }}>LiquiFi</span>
              <span style={{ fontSize: 9, color: "var(--cyan)", background: "rgba(6,214,224,0.08)", padding: "3px 10px", borderRadius: 20, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", border: "1px solid rgba(6,214,224,0.15)" }}>Autonomous Treasury AI</span>
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

          {/* Rate Ticker */}
          <div className="rate-ticker-wrap" style={{ borderTop: "1px solid var(--border-1)", padding: "7px 0" }}>
            <div className="rate-ticker-inner">
              {[...rateItems, ...rateItems].map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                  <span style={{ color: "var(--text-4)", fontSize: 10, fontWeight: 500 }}>{r.name}</span>
                  <span className="mono" style={{ color: "var(--text-0)", fontSize: 12, fontWeight: 600 }}>{r.rate.toFixed(r.isFx ? 2 : 2)}{r.isFx ? "" : "%"}</span>
                  <span className="mono" style={{ fontSize: 9, color: r.ch >= 0 ? "var(--green)" : "var(--red)", display: "flex", alignItems: "center" }}>
                    {r.ch >= 0 ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
                    {Math.abs(r.ch).toFixed(1)}{r.isFx ? "p" : "bp"}
                  </span>
                  <span style={{ color: "var(--border-2)", fontSize: 10 }}>│</span>
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* NAVIGATION */}
        <nav style={{ padding: "12px 24px 0", display: "flex", gap: 4, position: "relative", zIndex: 10, borderBottom: "1px solid var(--border-1)", paddingBottom: 12 }}>
          {TABS.map(t => (
            <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </nav>

        {/* CONTENT */}
        <main style={{ padding: "18px 24px 40px", position: "relative", zIndex: 10 }}>
          {tab === "command" && <TabCommandCenter rates={rates} clockData={clockData} historicalRates={historicalRates} cashFlowHistory={cashFlowHistory} paymentStreams={backend.paymentStreams} />}
          {tab === "ai" && <TabAIEngine clockData={clockData} cashFlowHistory={cashFlowHistory} />}
          {tab === "optimizer" && <TabOptimizer rates={rates} />}
          {tab === "execution" && (
            <TabExecution
              rates={rates}
              backend={backend}
              onExecuteDeployment={handleExecuteDeployment}
              onExportOrderBook={handleExportOrderBook}
              onRefreshTelemetry={handleRefreshTelemetry}
            />
          )}
          {tab === "risk" && <TabRisk backend={backend} onExportAuditTrail={handleExportAuditTrail} />}
          {tab === "instruments" && <TabInstruments rates={rates} />}
          {tab === "analytics" && <TabAnalytics />}
          {tab === "settings" && (
            <TabSettings
              backend={backend}
              onToggleKillSwitch={handleToggleKillSwitch}
              onToggleFailover={handleToggleFailover}
              onResetCircuit={handleResetCircuit}
            />
          )}
        </main>

        {/* Footer */}
        <footer style={{ borderTop: "1px solid var(--border-1)", padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 10 }}>
          <div style={{ display: "flex", gap: 16, fontSize: 10, color: "var(--text-4)" }}>
            <span>LiquiFi v2.4.1</span>
            <span>•</span>
            <span>AWS Mumbai (ap-south-1)</span>
            <span>•</span>
            <span>Kubernetes 8/8 pods healthy</span>
            <span>•</span>
            <span>Kafka: {backend.queueDepth} queued events</span>
            <span>•</span>
            <span>TimescaleDB: 2.1TB / 5TB</span>
          </div>
          <div style={{ display: "flex", gap: 12, fontSize: 10, color: "var(--text-4)" }}>
            <span>Data encrypted AES-256</span>
            <span>•</span>
            <span>RBI Data Residency ✓</span>
            <span>•</span>
            <span className="mono">Latency P99: {backend.apiLatencyP99.toFixed(0)}ms</span>
          </div>
        </footer>
      </div>
    </>
  );
}
