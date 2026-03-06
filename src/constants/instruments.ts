import type { PortfolioInstrument } from "../types";

export const EXEC_INSTRUMENTS = ["CBLO", "Call Money", "O/N Repo", "Liquid MMF", "T-Bill 91D", "Notice Money 7D", "CD 3M", "CP 1M"] as const;
export const EXEC_SIDES = ["LEND", "BORROW"] as const;

export const DEPLOYMENT_PORTFOLIO: PortfolioInstrument[] = [
  { instrument: "CBLO", amount: 280, pct: 35.1, rate: 6.58, maturity: "O/N", settlement: "T+0", risk: "AAA", collateral: "G-Sec", color: "#22d3ee" },
  { instrument: "Call Money", amount: 200, pct: 25.1, rate: 6.82, maturity: "O/N", settlement: "T+1", risk: "A1+", collateral: "Unsecured", color: "#a78bfa" },
  { instrument: "Overnight Repo", amount: 160, pct: 20.1, rate: 6.50, maturity: "O/N", settlement: "T+0", risk: "Sovereign", collateral: "G-Sec", color: "#34d399" },
  { instrument: "Liquid MMF", amount: 96, pct: 12.0, rate: 7.05, maturity: "Instant", settlement: "T+0", risk: "AAA", collateral: "Diversified", color: "#fbbf24" },
  { instrument: "T-Bill 91D", amount: 42, pct: 5.3, rate: 6.88, maturity: "91D", settlement: "T+1", risk: "Sovereign", collateral: "Sovereign", color: "#f87171" },
  { instrument: "Notice Money 7D", amount: 12, pct: 1.5, rate: 6.80, maturity: "7D", settlement: "T+1", risk: "A1+", collateral: "Unsecured", color: "#fb923c" },
  { instrument: "CD 3M", amount: 6, pct: 0.8, rate: 7.10, maturity: "3M", settlement: "T+1", risk: "A1+", collateral: "Bank", color: "#e879f9" },
  { instrument: "CP 1M", amount: 2, pct: 0.3, rate: 7.20, maturity: "1M", settlement: "T+1", risk: "A1", collateral: "Corporate", color: "#94a3b8" },
];
