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
    // Auto-cleanup when approaching quota
    const usage = getStorageUsage();
    if (usage.pct > 80) {
      console.warn(`[Storage] Usage at ${usage.pct.toFixed(0)}% — running auto-cleanup.`);
      autoCleanup();
    }
    return safeSetItem(key, serialized);
  } catch (err: unknown) {
    console.warn(`[Storage] Write failed for "${key}":`, err);
    return false;
  }
};

// ---------------------------------------------------------------------------
// Storage usage monitoring
// ---------------------------------------------------------------------------

interface StorageUsageInfo {
  usedBytes: number;
  estimatedQuota: number;
  pct: number;
  keyCount: number;
}

/**
 * Returns approximate localStorage usage in bytes and as a percentage of the
 * estimated 5 MB quota (most browsers).
 */
export function getStorageUsage(): StorageUsageInfo {
  if (typeof window === "undefined") return { usedBytes: 0, estimatedQuota: 5_242_880, pct: 0, keyCount: 0 };
  let totalBytes = 0;
  let keyCount = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k) {
        const v = window.localStorage.getItem(k) || "";
        // Each JS character is 2 bytes in UTF-16 (localStorage internal encoding)
        totalBytes += (k.length + v.length) * 2;
        keyCount++;
      }
    }
  } catch {
    // silently ignore — storage may be inaccessible
  }
  const quota = 5_242_880; // 5 MB — conservative estimate
  return {
    usedBytes: totalBytes,
    estimatedQuota: quota,
    pct: quota > 0 ? (totalBytes / quota) * 100 : 0,
    keyCount,
  };
}

// ---------------------------------------------------------------------------
// Auto cleanup — ordered by priority (least important first)
// ---------------------------------------------------------------------------

// Ordered from least to most important for cleanup
const CLEANUP_PRIORITY: string[] = [
  "liquifi.rateLimiter.v1",
  "liquifi.backend.state.v1",
  "liquifi.rateHistory.v1",
  "liquifi.events.v1",
];

/**
 * Automatically free space when usage exceeds 80% quota.
 * Prioritizes keeping recent rate history and active orders.
 * Removes oldest / least important keys first.
 */
export function autoCleanup(): number {
  if (typeof window === "undefined") return 0;
  let freed = 0;

  // Phase 1: evict known low-priority keys
  for (const key of CLEANUP_PRIORITY) {
    const val = window.localStorage.getItem(key);
    if (val !== null) {
      const size = (key.length + val.length) * 2;
      window.localStorage.removeItem(key);
      freed += size;
      console.warn(`[Storage Cleanup] Removed "${key}" (${(size / 1024).toFixed(1)} KB)`);
    }
    // Re-check usage — stop if below 60%
    if (getStorageUsage().pct < 60) break;
  }

  // Phase 2: if still over 80%, truncate any liquifi.* keys that hold arrays
  if (getStorageUsage().pct > 80) {
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k || !k.startsWith("liquifi.")) continue;
        const raw = window.localStorage.getItem(k);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 50) {
            // Keep only last 25 entries
            const truncated = parsed.slice(-25);
            const newVal = JSON.stringify(truncated);
            const savedBytes = (raw.length - newVal.length) * 2;
            window.localStorage.setItem(k, newVal);
            freed += savedBytes;
            console.warn(`[Storage Cleanup] Truncated "${k}" from ${parsed.length} to 25 entries (${(savedBytes / 1024).toFixed(1)} KB freed)`);
          }
        } catch {
          // Not JSON or unparseable — skip
        }
      }
    } catch {
      // storage access error — give up
    }
  }

  return freed;
}
