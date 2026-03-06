import type { Alert } from "../types";

export const ALERTS_FULL: Alert[] = [
  { type: "critical", icon: "AlertTriangle", msg: "Liquidity breach predicted in 3h — inject ₹20Cr via CBLO borrowing", time: "2m ago", color: "#ef4444", module: "AI Engine", action: "Auto-borrow initiated" },
  { type: "opportunity", icon: "TrendingUp", msg: "MIBOR-Repo spread at 32bps (>25bps threshold) — arbitrage available", time: "5m ago", color: "#22d3ee", module: "Optimizer", action: "Review allocation" },
  { type: "risk", icon: "Shield", msg: "HDFC Bank exposure at 9.2% — approaching 10% counterparty limit", time: "12m ago", color: "#fbbf24", module: "Risk", action: "Reduce by ₹8Cr" },
  { type: "info", icon: "Activity", msg: "MIBOR fixed at 6.75% (+5bps vs yesterday) — AI adjusting deployments", time: "18m ago", color: "#a78bfa", module: "AI Engine", action: "Auto-rebalance" },
  { type: "success", icon: "CheckCircle", msg: "₹50Cr auto-deployed: ₹25Cr CBLO + ₹15Cr Call + ₹10Cr Repo", time: "25m ago", color: "#34d399", module: "Execution", action: "Confirmed" },
  { type: "critical", icon: "AlertTriangle", msg: "GST payment ₹42Cr due in 4h — ensure current account adequacy", time: "30m ago", color: "#ef4444", module: "Forecast", action: "Schedule recall" },
  { type: "risk", icon: "Shield", msg: "Yes Bank credit watch negative (ICRA) — freeze new deployments", time: "45m ago", color: "#fbbf24", module: "Risk", action: "Exposure frozen" },
  { type: "compliance", icon: "FileText", msg: "Form A return auto-generated for yesterday's call money participation", time: "1h ago", color: "#3b82f6", module: "Compliance", action: "Filed" },
  { type: "opportunity", icon: "TrendingUp", msg: "CD 3M rate dropped 8bps — consider T-Bill switch for better liquidity", time: "1h ago", color: "#22d3ee", module: "Optimizer", action: "Pending review" },
  { type: "info", icon: "Radio", msg: "CCIL system maintenance window: 22:00-23:30 IST today", time: "2h ago", color: "#94a3b8", module: "System", action: "Noted" },
  { type: "success", icon: "CheckCircle", msg: "Notice Money ₹12Cr — 7-day notice period initiated for recall", time: "2h ago", color: "#34d399", module: "Execution", action: "Timer set" },
  { type: "risk", icon: "Flame", msg: "Stress test: MIBOR +200bps scenario shows ₹4.2Cr P&L impact", time: "3h ago", color: "#fb923c", module: "Risk", action: "Report ready" },
];
