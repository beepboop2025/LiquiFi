export const safeJsonParse = <T = unknown>(raw: string | null, fallback: T | null = null): T | null => {
  if (!raw || typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const storageRead = <T = unknown>(key: string, fallback: T | null = null): T | null => {
  if (typeof window === "undefined") return fallback;
  try {
    return safeJsonParse<T>(window.localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
};

// Keys ordered from least to most important — evicted first when quota exceeded
const EVICTION_PRIORITY: string[] = [
  "liquifi.rateLimiter.v1",
  "liquifi.backend.state.v1",
];

/**
 * Attempt to free localStorage space by removing least-important keys first.
 * Returns true if any space was freed.
 */
const tryEvictOldest = (): boolean => {
  let freed = false;
  for (const key of EVICTION_PRIORITY) {
    if (window.localStorage.getItem(key) !== null) {
      window.localStorage.removeItem(key);
      freed = true;
      console.warn(`[Storage] Evicted "${key}" to free quota.`);
      break;
    }
  }
  return freed;
};

/**
 * Safe wrapper around localStorage.setItem that handles QuotaExceededError.
 * When quota is exceeded, tries to evict least-important data before giving up.
 */
export const safeSetItem = (key: string, value: string): boolean => {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "QuotaExceededError") {
      console.warn(`[Storage] QuotaExceededError for "${key}". Attempting eviction.`);
      // Try removing the target key itself first
      try {
        window.localStorage.removeItem(key);
        window.localStorage.setItem(key, value);
        return true;
      } catch {
        // Still failing — evict least-important keys
      }
      // Evict from priority list and retry
      if (tryEvictOldest()) {
        try {
          window.localStorage.setItem(key, value);
          return true;
        } catch {
          console.warn(`[Storage] Still over quota after eviction for "${key}".`);
          return false;
        }
      }
      console.warn(`[Storage] Could not free enough space for "${key}".`);
      return false;
    }
    console.warn(`[Storage] setItem failed for "${key}":`, err);
    return false;
  }
};

export const storageWrite = (key: string, value: unknown): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > 4 * 1024 * 1024) {
      console.warn(
        `[Storage] Payload for "${key}" is ${(serialized.length / 1024 / 1024).toFixed(1)}MB — approaching localStorage quota.`
      );
    }
    return safeSetItem(key, serialized);
  } catch (err: unknown) {
    console.warn(`[Storage] Write failed for "${key}":`, err);
    return false;
  }
};
