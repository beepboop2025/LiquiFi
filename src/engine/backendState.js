import { rand, randIntInclusive } from '../utils/math.js';
import { createId, randomOf } from '../utils/helpers.js';
import { createAuditEntry } from '../utils/audit.js';
import { ORDER_BOOK, PAYMENT_STREAMS } from '../constants/erp.js';
import { INTEGRATION_BLUEPRINT } from '../constants/integrations.js';

/**
 * Generate seed audit trail entries.
 * @returns {Array<Object>}
 */
export const seedAuditTrail = () => [
  { id: createId("AUD"), time: "14:32:18", action: "AUTO_DEPLOY", detail: "\u20B920Cr CBLO lend to SBI via CCIL", user: "AI Engine", level: "info", hash: "a3f8...c2d1" },
  { id: createId("AUD"), time: "14:30:05", action: "RATE_UPDATE", detail: "MIBOR O/N fixed at 6.75% (FBIL)", user: "System", level: "info", hash: "b7e2...f4a9" },
  { id: createId("AUD"), time: "14:28:42", action: "RISK_ALERT", detail: "HDFC exposure 9.2% \u2014 within 0.8% of limit", user: "Risk Engine", level: "warn", hash: "c1d5...e8b3" },
  { id: createId("AUD"), time: "14:25:10", action: "COMPLIANCE", detail: "Form A return auto-generated and filed", user: "Compliance Bot", level: "info", hash: "d4f7...a1c6" },
  { id: createId("AUD"), time: "14:20:33", action: "FORECAST", detail: "LSTM retrained \u2014 MAPE improved 4.1% \u2192 3.8%", user: "ML Pipeline", level: "info", hash: "e6a2...b5d8" },
  { id: createId("AUD"), time: "14:15:00", action: "MANUAL_OVERRIDE", detail: "Treasurer approved \u20B910Cr increase to Axis limit", user: "Rajesh Sharma", level: "warn", hash: "f8c3...d2e7" },
];

/**
 * Create a simulated real-time payment transaction.
 * @returns {Object} Payment transaction record
 */
export const createRealtimePayment = () => ({
  id: createId("TXN"),
  type: randomOf(["RTGS", "NEFT", "UPI", "IMPS"]),
  direction: Math.random() > 0.48 ? "credit" : "debit",
  amount: rand(0.5, 90),
  counterparty: randomOf(["Reliance Industries", "TCS", "Infosys", "HDFC Ltd", "L&T", "Bajaj Finance", "Maruti Suzuki", "ITC Ltd", "ONGC", "SBI"]),
  status: randomOf(["settled", "pending", "processing", "settled", "settled", "failed"]),
  time: new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }),
  iso20022: `pacs.008.${String(randIntInclusive(100, 999))}`,
  bank: randomOf(["SBI", "HDFC", "ICICI", "Axis", "Kotak", "Yes Bank"]),
});

/**
 * Create the initial backend state for the UI.
 * @returns {Object} Initial backend state
 */
export const createBackendState = () => ({
  killSwitch: false,
  failoverMode: "auto",
  circuitOpen: false,
  circuitHalfOpen: false,
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
