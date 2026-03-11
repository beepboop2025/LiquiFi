import { ENGINE_STORAGE_KEY, ENGINE_SCHEMA_VERSION, ENGINE_LIMITS } from '../constants/engine';
import { EXEC_INSTRUMENTS, EXEC_SIDES } from '../constants/instruments';
import { generateRates } from '../generators/rates';
import { validateRates } from './validation';
import { storageRead, storageWrite } from '../utils/storage';
import { createBackendEvent } from '../utils/audit';
import { backendId } from '../utils/helpers';
import type {
  Engine,
  EngineState,
  EngineMetrics,
  RatesSnapshot,
  RateHistoryEntry,
  BackendEvent,
  Order,
  OrderInput,
  OrderStatus,
  CircuitState,
  EventLevel,
  SubmitOrderResult,
} from '../types';

// ---------------------------------------------------------------------------
// Internal types for persisted state shape
// ---------------------------------------------------------------------------

interface PersistedState {
  schemaVersion: number;
  rates: Record<string, number>;
  rateHistory: unknown[];
  events: unknown[];
  orderQueue: unknown[];
  processedKeys: string[];
  killSwitch: boolean;
  flags: { spreadAlert: boolean; fxAlert: boolean };
  metrics: Partial<EngineMetrics>;
}

/**
 * Create the backend engine state machine for order processing,
 * rate management, circuit breaker, and persistence.
 */
export const createBackendEngine = (seedRates: RatesSnapshot = generateRates()): Engine => {
  let state: EngineState = {
    schemaVersion: ENGINE_SCHEMA_VERSION,
    rates: validateRates(seedRates, seedRates).rates as unknown as RatesSnapshot,
    rateHistory: [],
    events: [],
    orderQueue: [],
    processedKeys: new Set<string>(),
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

  const ORDER_STATUSES = new Set<OrderStatus>(["queued", "retry", "failed", "settled"]);
  const CIRCUIT_STATES = new Set<CircuitState>(["closed", "open", "half_open"]);
  const EVENT_LEVELS = new Set<EventLevel>(["info", "warn", "error", "success"]);

  const toFinite = (value: unknown, fallback: number): number => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };

  const toSafeString = (value: unknown, fallback: string = "", maxLen: number = 120): string => {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) return fallback;
    return normalized.slice(0, maxLen);
  };

  const toIsoTime = (value: unknown, fallback: string = new Date().toISOString()): string => {
    if (typeof value !== "string") return fallback;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return fallback;
    return new Date(parsed).toISOString();
  };

  const sanitizeRateHistory = (rows: unknown[]): RateHistoryEntry[] => {
    if (!Array.isArray(rows)) return [];
    const rates = state.rates as unknown as Record<string, number>;
    const defaultSpread = (rates.mibor_overnight - rates.repo) * 100;
    return rows
      .filter((row): row is Record<string, unknown> => row != null && typeof row === "object")
      .slice(-ENGINE_LIMITS.maxRateHistory)
      .map((row) => ({
        ts: typeof row.ts === 'string' ? Date.parse(row.ts) : row.ts,
        mibor: +toFinite(row.mibor, rates.mibor_overnight).toFixed(4),
        repo: +toFinite(row.repo, rates.repo).toFixed(4),
        spread: +toFinite(row.spread, defaultSpread).toFixed(2),
        cblo: +toFinite(row.cblo, rates.cblo_bid).toFixed(4),
        usdinr: +toFinite(row.usdinr, rates.usdinr_spot).toFixed(4),
      }));
  };

  const sanitizeEvents = (rows: unknown[]): BackendEvent[] => {
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((row): row is Record<string, unknown> => row != null && typeof row === "object")
      .slice(0, ENGINE_LIMITS.maxEvents)
      .map((row) => ({
        id: toSafeString(row.id, backendId("evt"), 80),
        ts: toIsoTime(row.ts),
        level: (EVENT_LEVELS.has(row.level as EventLevel) ? row.level : "info") as EventLevel,
        module: toSafeString(row.module, "Backend", 40),
        message: toSafeString(row.message, "Recovered persisted event.", 300),
        meta: row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
          ? (row.meta as Record<string, unknown>)
          : {},
      }));
  };

  const sanitizeOrder = (order: unknown, idx: number): Order | null => {
    if (!order || typeof order !== "object") return null;
    const o = order as Record<string, unknown>;
    const createdAt = toIsoTime(o.createdAt);
    const statusRaw = typeof o.status === "string" ? o.status.toLowerCase() : "";
    const status = (ORDER_STATUSES.has(statusRaw as OrderStatus) ? statusRaw : "failed") as OrderStatus;
    const sanitized: Order = {
      id: toSafeString(o.id, `${backendId("ord")}-${idx}`, 120),
      idempotencyKey: toSafeString(o.idempotencyKey, backendId("idem"), 180),
      instrument: (EXEC_INSTRUMENTS as readonly string[]).includes(o.instrument as string)
        ? (o.instrument as string)
        : EXEC_INSTRUMENTS[0],
      side: (EXEC_SIDES as readonly string[]).includes(o.side as string)
        ? (o.side as string)
        : EXEC_SIDES[0],
      amount: +Math.max(0.01, toFinite(o.amount, 0.01)).toFixed(2),
      rate: +Math.max(0.0001, toFinite(o.rate, (state.rates as unknown as Record<string, number>).repo)).toFixed(4),
      counterparty: toSafeString(o.counterparty, "Liquidity Pool", 80),
      platform: toSafeString(o.platform, "Engine", 40),
      status,
      attempts: Math.max(0, Math.trunc(toFinite(o.attempts, 0))),
      nextAttemptAt: Math.max(0, Math.trunc(toFinite(o.nextAttemptAt, Date.now()))),
      createdAt,
      updatedAt: toIsoTime(o.updatedAt, createdAt),
      lastError: o.lastError ? toSafeString(o.lastError, "", 200) : null,
    };
    if (o.settledAt) {
      sanitized.settledAt = toIsoTime(o.settledAt, sanitized.updatedAt);
    }
    return sanitized;
  };

  const sanitizeMetrics = (incoming: unknown): EngineMetrics => {
    const source = incoming && typeof incoming === "object" ? (incoming as Partial<EngineMetrics>) : {};
    const asCount = (value: unknown, fallback: number = 0): number =>
      Math.max(0, Math.trunc(toFinite(value, fallback)));
    const metrics: EngineMetrics = {
      ...state.metrics,
      ticks: asCount(source.ticks, state.metrics.ticks),
      processedOrders: asCount(source.processedOrders, state.metrics.processedOrders),
      rejectedOrders: asCount(source.rejectedOrders, state.metrics.rejectedOrders),
      failedAttempts: asCount(source.failedAttempts, state.metrics.failedAttempts),
      hardFailures: asCount(source.hardFailures, state.metrics.hardFailures),
      retries: asCount(source.retries, state.metrics.retries),
      rateCorrections: asCount(source.rateCorrections, state.metrics.rateCorrections),
      consecutiveFailures: asCount(source.consecutiveFailures, state.metrics.consecutiveFailures),
      circuitState: CIRCUIT_STATES.has(source.circuitState as CircuitState)
        ? (source.circuitState as CircuitState)
        : state.metrics.circuitState,
      circuitOpenedAt: null,
    };

    if (metrics.circuitState === "open") {
      const openedAt = Math.trunc(toFinite(source.circuitOpenedAt, Date.now()));
      metrics.circuitOpenedAt = openedAt > 0 ? openedAt : Date.now();
    }
    if (metrics.circuitState === "closed") {
      metrics.consecutiveFailures = 0;
    }
    return metrics;
  };

  const trimProcessedKeys = (): void => {
    if (state.processedKeys.size <= ENGINE_LIMITS.maxIdempotencyKeys) return;
    state.processedKeys = new Set(Array.from(state.processedKeys).slice(-ENGINE_LIMITS.maxIdempotencyKeys));
  };

  const pushEvent = (event: BackendEvent): void => {
    state.events = [event, ...state.events].slice(0, ENGINE_LIMITS.maxEvents);
  };

  const persist = (): void => {
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

  const setCircuitState = (next: CircuitState, reason?: string): void => {
    if (state.metrics.circuitState === next) return;
    state.metrics.circuitState = next;
    if (next === "open") {
      state.metrics.circuitOpenedAt = Date.now();
    } else if (next === "closed") {
      state.metrics.circuitOpenedAt = null;
      state.metrics.consecutiveFailures = 0;
    }
    pushEvent(createBackendEvent(
      next === "open" ? "error" : "info",
      "Resilience",
      `Circuit ${next.toUpperCase()}${reason ? `: ${reason}` : ""}`
    ));
  };

  const hydrate = (): void => {
    const persisted = storageRead<PersistedState>(ENGINE_STORAGE_KEY, null);
    if (!persisted || persisted.schemaVersion !== ENGINE_SCHEMA_VERSION) {
      pushEvent(createBackendEvent("info", "Backend", "Fresh engine boot (no persisted state)."));
      persist();
      return;
    }

    const validated = validateRates(persisted.rates as unknown as Partial<RatesSnapshot>, state.rates as unknown as RatesSnapshot);
    state.rates = validated.rates as unknown as RatesSnapshot;
    state.rateHistory = sanitizeRateHistory(persisted.rateHistory);
    state.events = sanitizeEvents(persisted.events);
    state.orderQueue = (Array.isArray(persisted.orderQueue) ? persisted.orderQueue : [])
      .map((order: unknown, idx: number) => sanitizeOrder(order, idx))
      .filter((o): o is Order => o !== null)
      .slice(0, ENGINE_LIMITS.maxQueueSize);
    state.processedKeys = new Set(
      (Array.isArray(persisted.processedKeys) ? persisted.processedKeys : [])
        .filter((key): key is string => typeof key === "string" && key.trim() !== "")
        .map((key: string) => key.slice(0, 180))
    );
    state.killSwitch = Boolean(persisted.killSwitch);
    state.flags = {
      spreadAlert: Boolean(persisted.flags?.spreadAlert),
      fxAlert: Boolean(persisted.flags?.fxAlert),
    };
    state.metrics = sanitizeMetrics(persisted.metrics);
    trimProcessedKeys();

    if (validated.corrected) {
      state.metrics.rateCorrections += 1;
      pushEvent(createBackendEvent("warn", "Validation", "Persisted rates required sanitization during boot."));
    }
    pushEvent(createBackendEvent("info", "Backend", "Engine state restored from local storage."));
    persist();
  };

  const pruneRateLimitBucket = (now: number): void => {
    state.rateLimiterBucket = state.rateLimiterBucket.filter((ts) => now - ts < 60_000);
  };

  const acceptRateLimitedRequest = (): boolean => {
    const now = Date.now();
    pruneRateLimitBucket(now);
    if (state.rateLimiterBucket.length >= ENGINE_LIMITS.rateLimitPerMinute) {
      return false;
    }
    state.rateLimiterBucket.push(now);
    return true;
  };

  const submitOrder = (input: OrderInput, options: { idempotencyKey?: string; skipRateLimit?: boolean } = {}): SubmitOrderResult => {
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

    const instrument = (EXEC_INSTRUMENTS as readonly string[]).includes(input?.instrument) ? input.instrument : null;
    const side = (EXEC_SIDES as readonly string[]).includes(input?.side) ? input.side : null;
    const amount = Number(input?.amount) || 0;
    const rate = Number(input?.rate) || 0;
    const idempotencyKey = String(
      (input as unknown as Record<string, unknown>)?.idempotencyKey || options?.idempotencyKey || backendId("idem")
    );

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

    const order: Order = {
      id: backendId("ord"),
      idempotencyKey,
      instrument,
      side,
      amount: +amount.toFixed(2),
      rate: +rate.toFixed(4),
      counterparty: toSafeString(input?.counterparty, "Liquidity Pool", 80),
      platform: toSafeString(input?.platform, "Engine", 40),
      status: "queued",
      attempts: 0,
      nextAttemptAt: Date.now(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null,
    };

    state.orderQueue.unshift(order);
    pushEvent(createBackendEvent("info", "Gateway", `Order accepted: ${order.id} (${order.instrument} ${order.side} \u20B9${order.amount}Cr @ ${order.rate.toFixed(2)}%)`));
    persist();
    return { ok: true, orderId: order.id, idempotencyKey: order.idempotencyKey };
  };

  const processQueue = (): void => {
    if (state.killSwitch) return;

    const now = Date.now();
    if (state.metrics.circuitState === "open") {
      if (state.metrics.circuitOpenedAt && now - state.metrics.circuitOpenedAt >= ENGINE_LIMITS.circuitCooldownMs) {
        setCircuitState("half_open", "cooldown elapsed");
      } else {
        return;
      }
    }

    // In half_open state, only allow one probe order to test recovery.
    const isHalfOpen = state.metrics.circuitState === "half_open";
    let probeAttempted = false;

    state.orderQueue = state.orderQueue
      .map((order): Order => {
        if (!["queued", "retry"].includes(order.status)) return order;
        if ((order.nextAttemptAt || 0) > now) return order;

        // In half_open, process exactly one order as a probe
        if (isHalfOpen && probeAttempted) return order;
        if (isHalfOpen) probeAttempted = true;

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
              status: "failed" as OrderStatus,
              updatedAt: new Date().toISOString(),
              lastError: "Settlement gateway timeout",
            };
          }

          // In half_open, a probe failure re-opens the circuit immediately
          if (isHalfOpen) {
            setCircuitState("open", "recovery probe failed");
          }

          state.metrics.retries += 1;
          pushEvent(createBackendEvent("warn", "Execution", `Order ${order.id} retry scheduled (attempt ${attempts + 1}).`));
          return {
            ...order,
            attempts,
            status: "retry" as OrderStatus,
            nextAttemptAt: now + attempts * 2000,
            updatedAt: new Date().toISOString(),
            lastError: "Transient settlement timeout",
          };
        }

        state.metrics.processedOrders += 1;
        state.metrics.consecutiveFailures = 0;
        state.processedKeys.add(order.idempotencyKey);
        trimProcessedKeys();
        if (isHalfOpen) {
          setCircuitState("closed", "recovery probe succeeded");
        }
        pushEvent(createBackendEvent("success", "Execution", `Order ${order.id} settled successfully.`));
        return {
          ...order,
          status: "settled" as OrderStatus,
          updatedAt: new Date().toISOString(),
          settledAt: new Date().toISOString(),
          lastError: null,
        };
      })
      .slice(0, ENGINE_LIMITS.maxQueueSize);

    persist();
  };

  const tick = (externalRates?: Partial<RatesSnapshot>): RatesSnapshot => {
    const generated = externalRates || generateRates(state.rates as unknown as Partial<RatesSnapshot>);
    const validated = validateRates(generated as Partial<RatesSnapshot>, state.rates as unknown as RatesSnapshot);
    state.rates = validated.rates as unknown as RatesSnapshot;
    state.metrics.ticks += 1;

    if (validated.corrected) {
      state.metrics.rateCorrections += 1;
      pushEvent(createBackendEvent("warn", "Validation", "Incoming rate snapshot corrected by guardrails."));
    }

    const rates = state.rates as unknown as Record<string, number>;
    const spread = +((rates.mibor_overnight - rates.repo) * 100).toFixed(2);
    if (spread > 35 && !state.flags.spreadAlert) {
      state.flags.spreadAlert = true;
      pushEvent(createBackendEvent("warn", "Risk", `Spread stress: MIBOR-Repo at ${spread}bps.`));
    }
    if (spread < 28 && state.flags.spreadAlert) {
      state.flags.spreadAlert = false;
      pushEvent(createBackendEvent("info", "Risk", `Spread normalized: MIBOR-Repo at ${spread}bps.`));
    }
    if (rates.usdinr_spot > 84.5 && !state.flags.fxAlert) {
      state.flags.fxAlert = true;
      pushEvent(createBackendEvent("warn", "FX", `USD/INR elevated at ${rates.usdinr_spot.toFixed(2)}.`));
    }
    if (rates.usdinr_spot < 84.1 && state.flags.fxAlert) {
      state.flags.fxAlert = false;
      pushEvent(createBackendEvent("info", "FX", `USD/INR normalized at ${rates.usdinr_spot.toFixed(2)}.`));
    }

    state.rateHistory.push({
      ts: Date.now() as number,
      mibor: rates.mibor_overnight,
      repo: rates.repo,
      spread,
      cblo: rates.cblo_bid,
      usdinr: rates.usdinr_spot,
    });
    if (state.rateHistory.length > ENGINE_LIMITS.maxRateHistory) {
      state.rateHistory = state.rateHistory.slice(-ENGINE_LIMITS.maxRateHistory);
    }

    persist();
    return state.rates;
  };

  const runChaosBurst = (): void => {
    const rates = state.rates as unknown as Record<string, number>;
    const samples: (OrderInput & { idempotencyKey: string })[] = [
      { instrument: "CBLO", side: "LEND", amount: 18, rate: rates.cblo_bid, counterparty: "Liquidity Pool", platform: "Engine", idempotencyKey: backendId("drill") },
      { instrument: "Call Money", side: "LEND", amount: 25, rate: rates.mibor_overnight, counterparty: "Liquidity Pool", platform: "Engine", idempotencyKey: backendId("drill") },
      { instrument: "O/N Repo", side: "BORROW", amount: 42, rate: rates.repo + 0.1, counterparty: "Liquidity Pool", platform: "Engine", idempotencyKey: backendId("drill") },
      { instrument: "Liquid MMF", side: "LEND", amount: 12, rate: rates.mmf_liquid, counterparty: "Liquidity Pool", platform: "Engine", idempotencyKey: backendId("drill") },
      { instrument: "Notice Money 7D", side: "LEND", amount: 8, rate: rates.notice_7d, counterparty: "Liquidity Pool", platform: "Engine", idempotencyKey: backendId("drill") },
    ];
    samples.forEach((sample) => {
      submitOrder(sample, { skipRateLimit: true });
    });
    pushEvent(createBackendEvent("warn", "Chaos", "Chaos drill injected burst traffic into execution queue."));
    persist();
  };

  const setKillSwitch = (enabled: boolean): boolean => {
    const next = Boolean(enabled);
    if (state.killSwitch === next) return state.killSwitch;
    state.killSwitch = next;
    pushEvent(createBackendEvent(
      next ? "error" : "info",
      "Controls",
      next ? "Kill switch enabled. Order intake paused." : "Kill switch disabled. Order intake resumed."
    ));
    persist();
    return state.killSwitch;
  };

  const forceRecover = (): void => {
    setCircuitState("closed", "manual operator recovery");
    persist();
  };

  const getSnapshot = (): EngineState => ({
    ...state,
    rates: { ...state.rates },
    rateHistory: [...state.rateHistory],
    events: [...state.events],
    orderQueue: [...state.orderQueue],
    killSwitch: state.killSwitch,
    metrics: { ...state.metrics },
    processedKeys: new Set(state.processedKeys),
    rateLimiterBucket: [...state.rateLimiterBucket],
    schemaVersion: state.schemaVersion,
    flags: { ...state.flags },
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
