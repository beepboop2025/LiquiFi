import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Rates & Market Data
// ---------------------------------------------------------------------------
export interface RatesSnapshot {
  mibor_overnight: number;
  mibor_14d: number;
  mibor_1m: number;
  mibor_3m: number;
  cblo_bid: number;
  cblo_ask: number;
  repo: number;
  reverse_repo: number;
  cd_1m: number;
  cd_3m: number;
  cd_6m: number;
  cd_12m: number;
  cp_1m: number;
  cp_3m: number;
  tbill_91d: number;
  tbill_182d: number;
  tbill_364d: number;
  mifor_1m: number;
  mifor_3m: number;
  mifor_6m: number;
  sofr: number;
  usdinr_spot: number;
  usdinr_1m_fwd: number;
  ois_1y: number;
  ois_3y: number;
  ois_5y: number;
  gsec_10y: number;
  call_money_high: number;
  call_money_low: number;
  notice_7d: number;
  notice_14d: number;
  mmf_liquid: number;
  mmf_overnight: number;
  mmf_ultra_short: number;
}

export type RateField = keyof RatesSnapshot;

export interface RateHistoryEntry {
  ts: number;
  mibor: number;
  repo: number;
  spread: number;
  cblo: number;
  usdinr: number;
}

// ---------------------------------------------------------------------------
// Orders & Execution
// ---------------------------------------------------------------------------
export type OrderStatus = "queued" | "retry" | "failed" | "settled";
export type OrderSide = "LEND" | "BORROW";
export type CircuitState = "closed" | "open" | "half_open";

export interface Order {
  id: string;
  idempotencyKey: string;
  instrument: string;
  side: string;
  amount: number;
  rate: number;
  counterparty: string;
  platform: string;
  status: OrderStatus;
  attempts: number;
  nextAttemptAt: number;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  settledAt?: string;
}

export interface OrderInput {
  instrument: string;
  side: string;
  amount: number;
  rate: number;
  counterparty: string;
  platform: string;
}

export interface SubmitOrderResult {
  ok: boolean;
  error?: string;
  orderId?: string;
  idempotencyKey?: string;
}

// ---------------------------------------------------------------------------
// Engine State & Metrics
// ---------------------------------------------------------------------------
export interface EngineMetrics {
  ticks: number;
  processedOrders: number;
  rejectedOrders: number;
  failedAttempts: number;
  hardFailures: number;
  retries: number;
  rateCorrections: number;
  consecutiveFailures: number;
  circuitState: CircuitState;
  circuitOpenedAt: number | null;
}

export interface EngineState {
  schemaVersion: number;
  rates: RatesSnapshot;
  rateHistory: RateHistoryEntry[];
  events: BackendEvent[];
  orderQueue: Order[];
  processedKeys: Set<string>;
  rateLimiterBucket: number[];
  killSwitch: boolean;
  flags: { spreadAlert: boolean; fxAlert: boolean };
  metrics: EngineMetrics;
}

export interface Engine {
  hydrate: () => void;
  tick: (externalRates?: Partial<RatesSnapshot>) => void;
  submitOrder: (input: OrderInput, options?: { idempotencyKey?: string }) => SubmitOrderResult;
  processQueue: () => void;
  runChaosBurst: () => void;
  setKillSwitch: (enabled: boolean) => boolean;
  forceRecover: () => void;
  getSnapshot: () => EngineState;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
export interface ValidatedRates {
  rates: Record<string, number>;
  corrected: boolean;
}

export interface Counterparty {
  name: string;
  rating: string;
  agency: string;
  exposure: number;
  limit: number;
  pctLimit: number;
  reliability: number;
  sector: string;
  lastSettlement: string;
  watchlist: boolean;
}

export interface DeploymentLegSplit {
  amt: number;
  cp: string;
}

export interface DeploymentLeg {
  amount: number;
  rate: number;
  instrument: string;
  splits: DeploymentLegSplit[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  total: number;
}

// ---------------------------------------------------------------------------
// Events & Audit
// ---------------------------------------------------------------------------
export type EventLevel = "info" | "warn" | "error" | "success";

export interface BackendEvent {
  id: string;
  ts: string;
  level: EventLevel;
  module: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface AuditEntry {
  id: string;
  time: string;
  action: string;
  detail: string;
  user: string;
  level: "info" | "warn" | "error";
  hash: string;
}

// ---------------------------------------------------------------------------
// Backend State (UI-facing)
// ---------------------------------------------------------------------------
export interface PaymentStream {
  id: string;
  type: "RTGS" | "NEFT" | "UPI" | "IMPS";
  direction: "credit" | "debit";
  amount: number;
  counterparty: string;
  status: "settled" | "pending" | "processing" | "failed";
  time: string;
  iso20022: string;
  bank: string;
}

export interface OrderBookEntry {
  id: string;
  time: string;
  instrument: string;
  side: string;
  amount: number;
  rate: number;
  counterparty: string;
  status: string;
  fillPct: number;
  platform: string;
}

export interface Integration {
  system: string;
  status: string;
  latency: number | null;
  uptime: number;
}

export interface BackendState {
  killSwitch: boolean;
  failoverMode: string;
  circuitOpen: boolean;
  circuitHalfOpen: boolean;
  circuitOpenedAt: number | null;
  queueDepth: number;
  throughputPerMin: number;
  processedTx24h: number;
  failedTx24h: number;
  successRate: number;
  apiLatencyP99: number;
  idempotencyKeys: string[];
  deploymentCount: number;
  lastDeploySummary: string;
  orderBook: OrderBookEntry[];
  paymentStreams: PaymentStream[];
  integrations: Integration[];
  auditTrail: AuditEntry[];
}

// ---------------------------------------------------------------------------
// Data Quality
// ---------------------------------------------------------------------------
export interface DataQuality {
  realFieldsCount: number;
  totalFields: number;
  fallbackFields: number;
  stalenessSeconds: number;
}

// ---------------------------------------------------------------------------
// Forecasting & Monte Carlo
// ---------------------------------------------------------------------------
export interface ForecastPoint {
  hour: string;
  balance: number;
  predicted: number;
  ci95_upper: number;
  ci95_lower: number;
  ci99_upper: number;
  ci99_lower: number;
  min_buffer: number;
  inflow: number;
  outflow: number;
}

export interface MonteCarloPoint {
  hour: number;
  value: number;
  pathId: number;
}

export interface MonteCarloMetrics {
  lar_95: number;
  lar_99: number;
  expected_shortfall: number;
  breach_probability: number;
}

export interface MonteCarloData {
  paths: MonteCarloPoint[][];
  metrics: MonteCarloMetrics;
}

// ---------------------------------------------------------------------------
// Historical Data
// ---------------------------------------------------------------------------
export interface HistoricalRatePoint {
  day: string;
  dayNum: number;
  mibor: number;
  cblo: number;
  repo: number;
  spread: number;
}

export interface CashFlowPoint {
  day: number;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
  payroll: boolean;
  gst: boolean;
  advtax: boolean;
}

// ---------------------------------------------------------------------------
// Constants: Access & Roles
// ---------------------------------------------------------------------------
export type AccessLevel = "Admin" | "Executive" | "Operator" | "Observer" | "Manager";

export interface AccessRole {
  role: string;
  users: string[];
  permissions: string[];
  level: AccessLevel;
  twoFA: boolean;
}

// ---------------------------------------------------------------------------
// Constants: Alerts
// ---------------------------------------------------------------------------
export type AlertType = "critical" | "opportunity" | "risk" | "info" | "success" | "compliance";

export interface Alert {
  type: AlertType;
  icon: string;
  msg: string;
  time: string;
  color: string;
  module: string;
  action: string;
}

// ---------------------------------------------------------------------------
// Constants: Branches
// ---------------------------------------------------------------------------
export interface BranchPosition {
  cash: number;
  deployed: number;
  deposits: number;
  advances: number;
  crr: number;
  slr: number;
  pnl: number;
}

export interface Branch {
  code: string;
  name: string;
  region: string;
  city: string;
  position: BranchPosition;
}

export interface RegionConfig {
  branches: string[];
  color: string;
}

export interface RegionalSummary {
  branchCount: number;
  cash: number;
  deployed: number;
  deposits: number;
  pnl: number;
}

// ---------------------------------------------------------------------------
// Constants: Compliance
// ---------------------------------------------------------------------------
export interface StressScenario {
  scenario: string;
  desc: string;
  impact: number;
  severity: "low" | "medium" | "high" | "critical";
  survival: number;
  probability: number;
  mitigation: string;
}

export interface ComplianceItem {
  category: string;
  item: string;
  value: number | string;
  threshold: number | string;
  unit: string;
  status: "pass" | "warn" | "fail";
  frequency: string;
}

// ---------------------------------------------------------------------------
// Constants: Counterparties & Banking
// ---------------------------------------------------------------------------
export interface BankAccount {
  bank: string;
  account: string;
  balance: number;
  type: string;
  rtgs: boolean;
  neft: boolean;
}

// ---------------------------------------------------------------------------
// Constants: ERP
// ---------------------------------------------------------------------------
export interface Payable {
  vendor: string;
  amount: number;
  due: string;
  priority: "high" | "medium" | "low";
  erp: string;
}

export interface Receivable {
  client: string;
  amount: number;
  expected: string;
  confidence: number;
  erp: string;
}

export interface UpcomingEvent {
  event: string;
  date: string;
  amount: number;
  type: "inflow" | "outflow";
  icon: string;
}

export interface ErpData {
  payables: Payable[];
  receivables: Receivable[];
  upcoming: UpcomingEvent[];
}

// ---------------------------------------------------------------------------
// Constants: Instruments
// ---------------------------------------------------------------------------
export interface PortfolioInstrument {
  instrument: string;
  amount: number;
  pct: number;
  rate: number;
  maturity: string;
  settlement: string;
  risk: string;
  collateral: string;
  color: string;
}

// ---------------------------------------------------------------------------
// Constants: Performance
// ---------------------------------------------------------------------------
export interface PerfMetric {
  value: number;
  unit: string;
  label: string;
  target: number;
  trend: number[];
}

// ---------------------------------------------------------------------------
// Constants: Regulatory
// ---------------------------------------------------------------------------
export interface RbiPolicyRates {
  repo: number;
  sdf: number;
  msf: number;
  bankRate: number;
  crr: number;
  slr: number;
  reverseRepo: number;
}

export interface CrrSlrPosition {
  ndtl: number;
  crr: {
    rate: number;
    required: number;
    maintained: number;
    surplus: number;
    compliancePct: number;
  };
  slr: {
    rate: number;
    required: number;
    maintained: number;
    surplus: number;
    compliancePct: number;
    breakdown: {
      gsec: number;
      tbills: number;
      sdf: number;
      other: number;
    };
  };
}

export interface CrrHistoryPoint {
  day: number;
  label: string;
  required: number;
  maintained: number;
  surplus: number;
}

export interface AlmBucket {
  bucket: string;
  order: number;
  rsa: number;
  rsl: number;
  gap: number;
  cumulativeGap: number;
  gapPct: number;
  limit: number | null;
}

export interface LcrNsfr {
  lcr: {
    hqlaLevel1: number;
    hqlaLevel2: number;
    totalHqla: number;
    netOutflows: number;
    lcrPct: number;
    compliant: boolean;
  };
  nsfr: {
    asf: number;
    rsf: number;
    nsfrPct: number;
    compliant: boolean;
  };
}

export interface ReportType {
  id: string;
  name: string;
  title: string;
  frequency: string;
  submission: string;
  via: string;
  description: string;
}

export interface AlmLimit {
  maxNegMismatch: number;
  description: string;
}

// ---------------------------------------------------------------------------
// Constants: Tabs
// ---------------------------------------------------------------------------
export interface TabConfig {
  id: string;
  label: string;
  icon: LucideIcon;
}

// ---------------------------------------------------------------------------
// Constants: Engine Limits
// ---------------------------------------------------------------------------
export interface EngineLimits {
  maxRateHistory: number;
  maxEvents: number;
  maxQueueSize: number;
  rateLimitPerMinute: number;
  maxOrderAmountCr: number;
  maxRetryAttempts: number;
  circuitOpenAfterFailures: number;
  circuitCooldownMs: number;
  maxIdempotencyKeys: number;
}

// ---------------------------------------------------------------------------
// Component Props
// ---------------------------------------------------------------------------
export interface StatBoxProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: LucideIcon;
  small?: boolean;
}

export interface SectionTitleProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  right?: React.ReactNode;
}

export interface StatusBadgeProps {
  status: string;
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void;
  onCancel: () => void;
}

export interface MiniSparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export interface ToastItem {
  id: string;
  message: string;
  type: "info" | "success" | "warn" | "error";
}

// ---------------------------------------------------------------------------
// App-level Props
// ---------------------------------------------------------------------------
export type ForecastSource = "local" | "lstm" | "synthetic" | "backend";

export interface AppBackendState extends BackendState {
  dataQuality?: DataQuality;
  forecastSource?: ForecastSource;
}

export interface TabComponentProps {
  rates: RatesSnapshot;
  backend: AppBackendState;
  clockData: ForecastPoint[];
  historicalRates: HistoricalRatePoint[];
  cashFlowHistory: CashFlowPoint[];
  mcData: MonteCarloData | null;
  time: Date;
  backendConnected: boolean;
  engine: Engine;
  onBackendUpdate: (updates: Partial<AppBackendState>) => void;
}

// ---------------------------------------------------------------------------
// API Types
// ---------------------------------------------------------------------------
export interface WebSocketCallbacks {
  onRates: (data: {
    rates: RatesSnapshot;
    rateHistory: RateHistoryEntry[];
    source: string;
    dataQuality?: DataQuality;
  }) => void;
  onConnectionChange: (connected: boolean) => void;
  onDataQuality?: (quality: DataQuality) => void;
}

export interface HealthResponse {
  status: string;
  [key: string]: unknown;
}

export interface ForecastResponse {
  clockData: ForecastPoint[];
  source: string;
}

export interface MonteCarloResponse {
  paths: MonteCarloPoint[][];
  metrics: MonteCarloMetrics;
  hourly_stats: unknown;
}

export interface DataQualityResponse {
  current: DataQuality;
  trend: unknown;
  recommendations: string[];
}
