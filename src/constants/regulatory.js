/**
 * Regulatory constants — CRR/SLR, ALM, LCR/NSFR, RBI policy rates & limits.
 * Used as fallback data when backend is not available.
 */

// ---------------------------------------------------------------------------
// RBI Policy Rates (effective Dec 5, 2025)
// ---------------------------------------------------------------------------
export const RBI_POLICY_RATES = {
  repo: 5.25,
  sdf: 5.00,
  msf: 5.50,
  bankRate: 5.50,
  crr: 3.00,
  slr: 18.00,
  reverseRepo: 3.35, // No longer primary tool, SDF replaced
};

// ---------------------------------------------------------------------------
// CRR/SLR Demo Position
// ---------------------------------------------------------------------------
export const DEMO_CRR_SLR = {
  ndtl: 75000,
  crr: {
    rate: 3.00,
    required: 2250,
    maintained: 2295,
    surplus: 45,
    compliancePct: 102.0,
  },
  slr: {
    rate: 18.00,
    required: 13500,
    maintained: 14250,
    surplus: 750,
    compliancePct: 105.56,
    breakdown: {
      gsec: 9200,
      tbills: 2700,
      sdf: 1450,
      other: 900,
    },
  },
};

// ---------------------------------------------------------------------------
// 30-day CRR history for chart
// ---------------------------------------------------------------------------
export const DEMO_CRR_HISTORY = Array.from({ length: 30 }, (_, i) => {
  const base = 2250;
  const maintained = base + 20 + Math.sin(i * 0.5) * 30 + (Math.random() - 0.3) * 20;
  const nearMiss = i === 12 || i === 25;
  return {
    day: i + 1,
    label: `D-${30 - i}`,
    required: base,
    maintained: nearMiss ? base - 2 + Math.random() * 8 : Math.round(maintained * 100) / 100,
    surplus: nearMiss ? -2 + Math.random() * 8 : Math.round((maintained - base) * 100) / 100,
  };
});

// ---------------------------------------------------------------------------
// 30-day SLR history for chart
// ---------------------------------------------------------------------------
export const DEMO_SLR_HISTORY = Array.from({ length: 30 }, (_, i) => {
  const base = 13500;
  const surplusPct = 3 + Math.sin(i * 0.3) * 2 + Math.random() * 2;
  const maintained = base * (1 + surplusPct / 100);
  return {
    day: i + 1,
    label: `D-${30 - i}`,
    required: base,
    maintained: Math.round(maintained * 100) / 100,
    surplus: Math.round((maintained - base) * 100) / 100,
  };
});

// ---------------------------------------------------------------------------
// ALM Buckets (10 RBI-mandated time buckets)
// ---------------------------------------------------------------------------
export const DEMO_ALM_DATA = [
  { bucket: "1d",     order: 1,  rsa: 3200,  rsl: 4800,  gap: -1600, cumulativeGap: -1600, gapPct: -33.3, limit: 10 },
  { bucket: "2-7d",   order: 2,  rsa: 4500,  rsl: 5200,  gap: -700,  cumulativeGap: -2300, gapPct: -13.5, limit: 10 },
  { bucket: "8-14d",  order: 3,  rsa: 3800,  rsl: 4100,  gap: -300,  cumulativeGap: -2600, gapPct: -7.3,  limit: 10 },
  { bucket: "15-28d", order: 4,  rsa: 5200,  rsl: 5800,  gap: -600,  cumulativeGap: -3200, gapPct: -10.3, limit: 15 },
  { bucket: "29d-3m", order: 5,  rsa: 7500,  rsl: 6800,  gap: 700,   cumulativeGap: -2500, gapPct: 10.3,  limit: null },
  { bucket: "3-6m",   order: 6,  rsa: 8200,  rsl: 7100,  gap: 1100,  cumulativeGap: -1400, gapPct: 15.5,  limit: null },
  { bucket: "6-12m",  order: 7,  rsa: 9800,  rsl: 8500,  gap: 1300,  cumulativeGap: -100,  gapPct: 15.3,  limit: null },
  { bucket: "1-3y",   order: 8,  rsa: 12500, rsl: 10200, gap: 2300,  cumulativeGap: 2200,  gapPct: 22.5,  limit: null },
  { bucket: "3-5y",   order: 9,  rsa: 8800,  rsl: 7500,  gap: 1300,  cumulativeGap: 3500,  gapPct: 17.3,  limit: null },
  { bucket: ">5y",    order: 10, rsa: 6500,  rsl: 8000,  gap: -1500, cumulativeGap: 2000,  gapPct: -18.8, limit: null },
];

// ---------------------------------------------------------------------------
// ALM RBI Limits (per Master Circular on ALM System)
// ---------------------------------------------------------------------------
export const RBI_ALM_LIMITS = {
  "1d":     { maxNegMismatch: 10, description: "Negative mismatch ≤ 10% of outflows" },
  "2-7d":   { maxNegMismatch: 10, description: "Negative mismatch ≤ 10% of outflows" },
  "8-14d":  { maxNegMismatch: 10, description: "Negative mismatch ≤ 10% of outflows" },
  "15-28d": { maxNegMismatch: 15, description: "Negative mismatch ≤ 15% of outflows" },
};

// ---------------------------------------------------------------------------
// LCR/NSFR Demo Data
// ---------------------------------------------------------------------------
export const DEMO_LCR_NSFR = {
  lcr: {
    hqlaLevel1: 9200,
    hqlaLevel2: 1800,
    totalHqla: 11000,
    netOutflows: 9167,
    lcrPct: 120.0,
    compliant: true,
  },
  nsfr: {
    asf: 52000,
    rsf: 45217,
    nsfrPct: 115.0,
    compliant: true,
  },
};

// ---------------------------------------------------------------------------
// Report Types
// ---------------------------------------------------------------------------
export const REPORT_TYPES = [
  {
    id: "form_a",
    name: "Form A",
    title: "CRR Fortnightly Return",
    frequency: "Fortnightly",
    submission: "Within 7 days (provisional), 20 days (final)",
    via: "CIMS",
    description: "Daily CRR position report for each fortnight period",
  },
  {
    id: "form_viii",
    name: "Form VIII",
    title: "SLR Monthly Return",
    frequency: "Monthly",
    submission: "Within 20 days of month-end",
    via: "CIMS",
    description: "Monthly SLR position with daily annex and asset breakdown",
  },
  {
    id: "alm_statement",
    name: "ALM Statement",
    title: "Structural Liquidity Statement",
    frequency: "Monthly / Quarterly",
    submission: "Per ALCO schedule",
    via: "Internal + RBI on demand",
    description: "10-bucket gap analysis with IRRBB and LCR/NSFR ratios",
  },
];

// ---------------------------------------------------------------------------
// NDTL Components (what counts per RBI rules)
// ---------------------------------------------------------------------------
export const NDTL_COMPONENTS = {
  includes: [
    "Demand Liabilities (current accounts, demand drafts)",
    "Time Liabilities (fixed deposits, recurring deposits)",
    "Other Demand & Time Liabilities (FCNR-B, NRE, NRO)",
    "Liabilities to Banking System (net)",
  ],
  excludes: [
    "Paid-up capital",
    "Reserves (excluding credit balance in P&L)",
    "Refinance from RBI/NABARD/SIDBI",
    "CLF/LAF borrowings",
  ],
};
