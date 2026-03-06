import type { PaymentStream, OrderBookEntry, ErpData } from "../types";
import { rand, randInt, randIntInclusive } from '../utils/math';

export const PAYMENT_STREAMS: PaymentStream[] = Array.from({ length: 20 }, (_, i) => ({
  id: `TXN${String(1000 + i).padStart(6, "0")}`,
  type: (["RTGS", "NEFT", "UPI", "IMPS"] as const)[randInt(0, 4)],
  direction: Math.random() > 0.45 ? "credit" as const : "debit" as const,
  amount: rand(0.5, 85),
  counterparty: ["Reliance Industries", "TCS", "Infosys", "HDFC Ltd", "L&T", "Bajaj Finance", "Maruti Suzuki", "ITC Ltd", "ONGC", "SBI"][randInt(0, 10)],
  status: (["settled", "pending", "processing", "settled", "settled"] as const)[randInt(0, 5)],
  time: `${String(randIntInclusive(9, 18)).padStart(2, "0")}:${String(randIntInclusive(0, 59)).padStart(2, "0")}`,
  iso20022: `pacs.008.${String(randIntInclusive(100, 999))}`,
  bank: ["SBI", "HDFC", "ICICI", "Axis", "Kotak", "Yes Bank"][randInt(0, 6)],
}));

export const ORDER_BOOK: OrderBookEntry[] = Array.from({ length: 15 }, (_, i) => ({
  id: `ORD-${String(2024001 + i)}`,
  time: `${String(randIntInclusive(9, 17)).padStart(2, "0")}:${String(randIntInclusive(0, 59)).padStart(2, "0")}:${String(randIntInclusive(0, 59)).padStart(2, "0")}`,
  instrument: ["CBLO", "Call Money", "Repo", "Liquid MMF", "T-Bill", "Notice 7D"][randInt(0, 6)],
  side: Math.random() > 0.4 ? "LEND" : "BORROW",
  amount: randIntInclusive(5, 80),
  rate: rand(6.3, 7.2),
  counterparty: ["SBI", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra", "Bank of Baroda"][randInt(0, 6)],
  status: ["FILLED", "PARTIAL", "OPEN", "FILLED", "FILLED", "CANCELLED"][randInt(0, 6)],
  fillPct: randIntInclusive(60, 100),
  platform: ["CCIL", "NDS-Call", "FX-CLEAR", "CAMS", "NDS-OM"][randInt(0, 5)],
}));

export const ERP_DATA: ErpData = {
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
    { event: "Payroll Cycle", date: "Mar 1", amount: 82, type: "outflow", icon: "Users" },
    { event: "GST Payment", date: "Mar 20", amount: 42, type: "outflow", icon: "Landmark" },
    { event: "Advance Tax", date: "Mar 15", amount: 65, type: "outflow", icon: "FileText" },
    { event: "Bond Coupon", date: "Mar 10", amount: 15, type: "inflow", icon: "CreditCard" },
    { event: "Client Settlement", date: "Mar 5", amount: 55, type: "inflow", icon: "Building" },
  ],
};
