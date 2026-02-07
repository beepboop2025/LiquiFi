export const BANK_ACCOUNTS = [
  { bank: "SBI", account: "XXXXXXX1234", balance: 82.5, type: "Current", rtgs: true, neft: true },
  { bank: "HDFC Bank", account: "XXXXXXX5678", balance: 64.3, type: "Current", rtgs: true, neft: true },
  { bank: "ICICI Bank", account: "XXXXXXX9012", balance: 38.7, type: "Current", rtgs: true, neft: true },
  { bank: "Axis Bank", account: "XXXXXXX3456", balance: 27.1, type: "Current", rtgs: true, neft: true },
  { bank: "Kotak", account: "XXXXXXX7890", balance: 18.9, type: "Current", rtgs: true, neft: true },
  { bank: "Yes Bank", account: "XXXXXXX2345", balance: 13.5, type: "CC/OD", rtgs: true, neft: true },
];

export const COUNTERPARTIES = [
  { name: "SBI", rating: "A1+", agency: "CRISIL", exposure: 85, limit: 100, pctLimit: 10, reliability: 99.8, sector: "PSU", lastSettlement: "On-time", watchlist: false },
  { name: "HDFC Bank", rating: "A1+", agency: "ICRA", exposure: 92, limit: 100, pctLimit: 10, reliability: 99.5, sector: "Private", lastSettlement: "On-time", watchlist: true },
  { name: "ICICI Bank", rating: "A1+", agency: "CRISIL", exposure: 68, limit: 100, pctLimit: 10, reliability: 99.7, sector: "Private", lastSettlement: "On-time", watchlist: false },
  { name: "Axis Bank", rating: "A1+", agency: "CARE", exposure: 45, limit: 100, pctLimit: 10, reliability: 98.9, sector: "Private", lastSettlement: "On-time", watchlist: false },
  { name: "Kotak Mahindra", rating: "A1", agency: "ICRA", exposure: 30, limit: 80, pctLimit: 8, reliability: 99.1, sector: "Private", lastSettlement: "On-time", watchlist: false },
  { name: "Bank of Baroda", rating: "A1+", agency: "CRISIL", exposure: 22, limit: 100, pctLimit: 10, reliability: 98.5, sector: "PSU", lastSettlement: "Delayed 2h", watchlist: false },
  { name: "PNB", rating: "A1", agency: "CARE", exposure: 15, limit: 60, pctLimit: 6, reliability: 97.8, sector: "PSU", lastSettlement: "On-time", watchlist: false },
  { name: "Yes Bank", rating: "A2", agency: "ICRA", exposure: 8, limit: 30, pctLimit: 3, reliability: 96.2, sector: "Private", lastSettlement: "Delayed 4h", watchlist: true },
];

export const COUNTERPARTY_ALIASES = {
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
