/**
 * Safely parse a JSON string with a fallback value.
 * @param {string|null} raw
 * @param {*} fallback
 * @returns {*}
 */
export const safeJsonParse = (raw, fallback = null) => {
  if (!raw || typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

/**
 * Read a value from localStorage with safe JSON parsing.
 * @param {string} key
 * @param {*} fallback
 * @returns {*}
 */
export const storageRead = (key, fallback = null) => {
  if (typeof window === "undefined") return fallback;
  try {
    return safeJsonParse(window.localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
};

/**
 * Write a value to localStorage as JSON.
 * @param {string} key
 * @param {*} value
 * @returns {boolean} Whether the write succeeded
 */
export const storageWrite = (key, value) => {
  if (typeof window === "undefined") return false;
  try {
    const serialized = JSON.stringify(value);
    // Guard against localStorage quota (~5MB). Warn above 4MB.
    if (serialized.length > 4 * 1024 * 1024) {
      console.warn(`[Storage] Payload for "${key}" is ${(serialized.length / 1024 / 1024).toFixed(1)}MB — approaching localStorage quota.`);
    }
    window.localStorage.setItem(key, serialized);
    return true;
  } catch (err) {
    // QuotaExceededError: clear stale data and retry once
    if (err?.name === "QuotaExceededError") {
      console.warn(`[Storage] Quota exceeded for "${key}". Clearing key and retrying.`);
      try {
        window.localStorage.removeItem(key);
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }
    console.warn(`[Storage] Write failed for "${key}":`, err);
    return false;
  }
};
