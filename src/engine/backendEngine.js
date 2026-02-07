import { ENGINE_STORAGE_KEY, ENGINE_SCHEMA_VERSION, ENGINE_LIMITS } from '../constants/engine.js';
import { EXEC_INSTRUMENTS, EXEC_SIDES } from '../constants/instruments.js';
import { generateRates } from '../generators/rates.js';
import { validateRates } from './validation.js';
import { storageRead, storageWrite } from '../utils/storage.js';
import { createBackendEvent } from '../utils/audit.js';
import { backendId } from '../utils/helpers.js';

/**
 * Create the backend engine state machine for order processing,
 * rate management, circuit breaker, and persistence.
 *
 * @param {Object} [seedRates] - Initial rate values
 * @returns {Object} Engine with hydrate, tick, submitOrder, processQueue, etc.
 */
export const createBackendEngine = (seedRates = generateRates()) => {
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

  const ORDER_STATUSES = new Set(["queued", "retry", "failed", "settled"]);
  const CIRCUIT_STATES = new Set(["closed", "open", "half_open"]);
  const EVENT_LEVELS = new Set(["info", "warn", "error", "success"]);

  const toFinite = (value, fallback) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  };

  const toSafeString = (value, fallback = "", maxLen = 120) => {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) return fallback;
    return normalized.slice(0, maxLen);
  };

  const toIsoTime = (value, fallback = new Date().toISOString()) => {
    if (typeof value !== "string") return fallback;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return fallback;
    return new Date(parsed).toISOString();
  };

  const sanitizeRateHistory = (rows) => {
    if (!Array.isArray(rows)) return [];
    const defaultSpread = (state.rates.mibor_overnight - state.rates.repo) * 100;
    return rows
      .filter((row) => row && typeof row === "object")
      .slice(-ENGINE_LIMITS.maxRateHistory)
      .map((row) => ({
        ts: toIsoTime(row.ts),
        mibor: +toFinite(row.mibor, state.rates.mibor_overnight).toFixed(4),
        repo: +toFinite(row.repo, state.rates.repo).toFixed(4),
        spread: +toFinite(row.spread, defaultSpread).toFixed(2),
        cblo: +toFinite(row.cblo, state.rates.cblo_bid).toFixed(4),
        usdinr: +toFinite(row.usdinr, state.rates.usdinr_spot).toFixed(4),
      }));
  };

  const sanitizeEvents = (rows) => {
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((row) => row && typeof row === "object")
      .slice(0, ENGINE_LIMITS.maxEvents)
      .map((row) => ({
        id: toSafeString(row.id, backendId("evt"), 80),
        ts: toIsoTime(row.ts),
        level: EVENT_LEVELS.has(row.level) ? row.level : "info",
        module: toSafeString(row.module, "Backend", 40),
        message: toSafeString(row.message, "Recovered persisted event.", 300),
        meta: row.meta && typeof row.meta === "object" && !Array.isArray(row.meta) ? row.meta : {},
      }));
  };

  const sanitizeOrder = (order, idx) => {
    if (!order || typeof order !== "object") return null;
    const createdAt = toIsoTime(order.createdAt);
    const statusRaw = typeof order.status === "string" ? order.status.toLowerCase() : "";
    const status = ORDER_STATUSES.has(statusRaw) ? statusRaw : "failed";
    const sanitized = {
      id: toSafeString(order.id, `${backendId("ord")}-${idx}`, 120),
      idempotencyKey: toSafeString(order.idempotencyKey, backendId("idem"), 180),
      instrument: EXEC_INSTRUMENTS.includes(order.instrument) ? order.instrument : EXEC_INSTRUMENTS[0],
      side: EXEC_SIDES.includes(order.side) ? order.side : EXEC_SIDES[0],
      amount: +Math.max(0.01, toFinite(order.amount, 0.01)).toFixed(2),
      rate: +Math.max(0.0001, toFinite(order.rate, state.rates.repo)).toFixed(4),
      counterparty: toSafeString(order.counterparty, "Liquidity Pool", 80),
      platform: toSafeString(order.platform, "Engine", 40),
      status,
      attempts: Math.max(0, Math.trunc(toFinite(order.attempts, 0))),
      nextAttemptAt: Math.max(0, Math.trunc(toFinite(order.nextAttemptAt, Date.now()))),
      createdAt,
      updatedAt: toIsoTime(order.updatedAt, createdAt),
      lastError: order.lastError ? toSafeString(order.lastError, "", 200) : null,
    };
    if (order.settledAt) {
      sanitized.settledAt = toIsoTime(order.settledAt, sanitized.updatedAt);
    }
    return sanitized;
  };

  const sanitizeMetrics = (incoming) => {
    const source = incoming && typeof incoming === "object" ? incoming : {};
    const asCount = (value, fallback = 0) => Math.max(0, Math.trunc(toFinite(value, fallback)));
    const metrics = {
      ...state.metrics,
      ticks: asCount(source.ticks, state.metrics.ticks),
      processedOrders: asCount(source.processedOrders, state.metrics.processedOrders),
      rejectedOrders: asCount(source.rejectedOrders, state.metrics.rejectedOrders),
      failedAttempts: asCount(source.failedAttempts, state.metrics.failedAttempts),
      hardFailures: asCount(source.hardFailures, state.metrics.hardFailures),
      retries: asCount(source.retries, state.metrics.retries),
      rateCorrections: asCount(source.rateCorrections, state.metrics.rateCorrections),
      consecutiveFailures: asCount(source.consecutiveFailures, state.metrics.consecutiveFailures),
      circuitState: CIRCUIT_STATES.has(source.circuitState) ? source.circuitState : state.metrics.circuitState,
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
    pushEvent(createBackendEvent(
      next === "open" ? "error" : "info",
      "Resilience",
      `Circuit ${next.toUpperCase()}${reason ? `: ${reason}` : ""}`
    ));
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
    state.rateHistory = sanitizeRateHistory(persisted.rateHistory);
    state.events = sanitizeEvents(persisted.events);
    state.orderQueue = (Array.isArray(persisted.orderQueue) ? persisted.orderQueue : [])
      .map((order, idx) => sanitizeOrder(order, idx))
      .filter(Boolean)
      .slice(0, ENGINE_LIMITS.maxQueueSize);
    state.processedKeys = new Set(
      (Array.isArray(persisted.processedKeys) ? persisted.processedKeys : [])
        .filter((key) => typeof key === "string" && key.trim())
        .map((key) => key.slice(0, 180))
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

    // In half_open state, only allow one probe order to test recovery.
    const isHalfOpen = state.metrics.circuitState === "half_open";
    let probeAttempted = false;

    state.orderQueue = state.orderQueue
      .map((order) => {
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
              status: "failed",
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
        if (isHalfOpen) {
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

  const tick = (externalRates) => {
    const generated = externalRates || generateRates(state.rates);
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
    pushEvent(createBackendEvent(
      next ? "error" : "info",
      "Controls",
      next ? "Kill switch enabled. Order intake paused." : "Kill switch disabled. Order intake resumed."
    ));
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
