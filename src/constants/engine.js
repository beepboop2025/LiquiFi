export const ENGINE_STORAGE_KEY = "liquifi.backend.state.v1";
export const ENGINE_SCHEMA_VERSION = 1;

export const ENGINE_LIMITS = {
  maxRateHistory: 240,
  maxEvents: 140,
  maxQueueSize: 80,
  rateLimitPerMinute: 20,
  maxOrderAmountCr: 150,
  maxRetryAttempts: 3,
  circuitOpenAfterFailures: 4,
  circuitCooldownMs: 20_000,
  maxIdempotencyKeys: 300,
};
