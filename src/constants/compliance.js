export const STRESS_SCENARIOS = [
  { scenario: "MIBOR +200bps Spike", desc: "Sudden liquidity tightening", impact: -4.2, severity: "high", survival: 18, probability: 8, mitigation: "Pre-position CBLO borrowing lines" },
  { scenario: "Top 3 Counterparty Default", desc: "Concentration risk event", impact: -12.5, severity: "critical", survival: 6, probability: 0.5, mitigation: "Diversify across 8+ counterparties" },
  { scenario: "MMF Redemption Gate", desc: "Fund liquidity freeze", impact: -8.1, severity: "high", survival: 12, probability: 3, mitigation: "Keep MMF <15% of portfolio" },
  { scenario: "RTGS System Outage", desc: "Payment infrastructure failure", impact: -15.0, severity: "critical", survival: 4, probability: 1, mitigation: "Maintain NEFT/UPI backup channels" },
  { scenario: "RBI Emergency Rate Hike 50bps", desc: "Monetary policy shock", impact: -2.8, severity: "medium", survival: 48, probability: 5, mitigation: "OIS hedge on 40% portfolio" },
  { scenario: "USD/INR 3% Depreciation", desc: "Currency crisis", impact: -6.3, severity: "high", survival: 8, probability: 4, mitigation: "MIFOR hedge for FX exposures" },
  { scenario: "Corporate Bond Market Freeze", desc: "Credit market stress", impact: -3.5, severity: "medium", survival: 24, probability: 2, mitigation: "Rotate to sovereign instruments" },
  { scenario: "Simultaneous: Rate Hike + FX Crisis", desc: "Twin shock scenario", impact: -18.7, severity: "critical", survival: 3, probability: 0.3, mitigation: "Emergency liquidity facility" },
];

export const COMPLIANCE_ITEMS = [
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
